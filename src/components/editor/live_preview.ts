import { EditorState, Range, StateEffect, StateField } from '@codemirror/state';
import {
  EditorView,
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  WidgetType,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';

/**
 * Live Preview para o editor Atlas.
 *
 * Regras:
 * - Esconde a marcação (##, **, *, `, [], (), >) e aplica tipografia.
 * - O preview é aplicado em TODAS as linhas, inclusive na linha ativa.
 * - Wiki-links ([[pagina]]) e @tags (@tag) não são parseados pela gramática
 *   padrão; tratamos via regex em texto "livre".
 *
 * Modo de debug (cicla com Alt+L):
 *   0 = full (syntax tree + regex passes de ==, [[, #tag, <aside>, <!--)
 *   1 = syntax only (apenas markdown grammar — sem regex passes)
 *   2 = off (markdown cru, sem decorações)
 */

const HEADING_RE = /^ATXHeading(\d)$/;

// ─── Debug mode toggle ───────────────────────────────────────────
export type LivePreviewMode = 0 | 1 | 2;

/** Effect to change the live-preview mode at runtime. */
export const setLivePreviewMode = StateEffect.define<LivePreviewMode>();

/** StateField holding the current mode so the ViewPlugin can react. */
export const livePreviewModeField = StateField.define<LivePreviewMode>({
  create: () => 0,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setLivePreviewMode)) return e.value;
    }
    return value;
  },
});

// ─── Widgets ─────────────────────────────────────────────────────

class HrWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement('div');
    el.className = 'atlas-hr-widget';
    return el;
  }
}

class TaskCheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: TaskCheckboxWidget) {
    return other.checked === this.checked;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'atlas-task-checkbox';
    el.textContent = this.checked ? '☑' : '☐';
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function hideRange(from: number, to: number, decos: Range<Decoration>[]) {
  decos.push(Decoration.replace({}).range(from, to));
}

/**
 * Like hideRange but uses Decoration.mark with a CSS class instead of
 * Decoration.replace. Replace-based decorations corrupt CodeMirror's
 * DOM↔document position mapping when they overlap other decorations —
 * which can happen when regex passes match text that also intersects
 * syntax-tree nodes. Mark-based hiding avoids this entirely.
 */
function hideRangeMark(from: number, to: number, decos: Range<Decoration>[]) {
  if (from < to) {
    decos.push(Decoration.mark({ class: 'atlas-hidden-marker' }).range(from, to));
  }
}

function hideMarkPlusTrailingSpace(
  state: EditorState,
  from: number,
  to: number,
  decos: Range<Decoration>[],
) {
  let end = to;
  const next = state.doc.sliceString(to, to + 1);
  if (next === ' ' || next === '\t') end += 1;
  hideRange(from, end, decos);
}

/** Push a Decoration.mark only when the range is non-empty. */
function safeMark(cls: string, from: number, to: number, decos: Range<Decoration>[]) {
  if (from < to) {
    decos.push(Decoration.mark({ class: cls }).range(from, to));
  }
}

function iterChildren(ref: SyntaxNodeRef) {
  return {
    *[Symbol.iterator]() {
      const parent = ref.node;
      if (!parent) return;
      let child = parent.firstChild;
      while (child) {
        yield child;
        child = child.nextSibling;
      }
    },
  };
}

// ─── Decoration builders ─────────────────────────────────────────

function decorateHeading(
  state: EditorState,
  ref: SyntaxNodeRef,
  level: number,
  decos: Range<Decoration>[],
) {
  decos.push(Decoration.mark({ class: `atlas-h${level}` }).range(ref.from, ref.to));
  for (const child of iterChildren(ref)) {
    if (child.name === 'HeaderMark') {
      hideMarkPlusTrailingSpace(state, child.from, child.to, decos);
    }
  }
}

function decorateEmphasisLike(
  ref: SyntaxNodeRef,
  cls: string,
  decos: Range<Decoration>[],
) {
  decos.push(Decoration.mark({ class: cls }).range(ref.from, ref.to));
  for (const child of iterChildren(ref)) {
    if (child.name === 'EmphasisMark') hideRange(child.from, child.to, decos);
  }
}

function decorateInlineCode(ref: SyntaxNodeRef, decos: Range<Decoration>[]) {
  decos.push(Decoration.mark({ class: 'atlas-code' }).range(ref.from, ref.to));
  for (const child of iterChildren(ref)) {
    if (child.name === 'CodeMark') hideRange(child.from, child.to, decos);
  }
}

function decorateLink(ref: SyntaxNodeRef, decos: Range<Decoration>[]) {
  decos.push(Decoration.mark({ class: 'atlas-link' }).range(ref.from, ref.to));
  for (const child of iterChildren(ref)) {
    if (child.name === 'LinkMark' || child.name === 'URL' || child.name === 'LinkLabel') {
      hideRange(child.from, child.to, decos);
    }
  }
}

function decorateFencedCode(ref: SyntaxNodeRef, decos: Range<Decoration>[]) {
  decos.push(Decoration.mark({ class: 'atlas-codeblock' }).range(ref.from, ref.to));
  for (const child of iterChildren(ref)) {
    if (child.name === 'CodeMark') {
      hideRange(child.from, child.to, decos);
    } else if (child.name === 'CodeInfo') {
      // Show language as a styled label instead of hiding it
      decos.push(Decoration.mark({ class: 'atlas-codeblock-lang' }).range(child.from, child.to));
    }
  }
}

function decorateQuote(ref: SyntaxNodeRef, decos: Range<Decoration>[]) {
  decos.push(Decoration.mark({ class: 'atlas-quote' }).range(ref.from, ref.to));
}

function decorateStrikethrough(ref: SyntaxNodeRef, decos: Range<Decoration>[]) {
  safeMark('atlas-strikethrough', ref.from, ref.to, decos);
  for (const child of iterChildren(ref)) {
    if (child.name === 'StrikethroughMark') hideRange(child.from, child.to, decos);
  }
}

function decorateTable(ref: SyntaxNodeRef, decos: Range<Decoration>[]) {
  safeMark('atlas-table', ref.from, ref.to, decos);
  for (const child of iterChildren(ref)) {
    if (child.name === 'TableDelimiter') {
      safeMark('atlas-table-delimiter', child.from, child.to, decos);
    } else if (child.name === 'TableHeader') {
      safeMark('atlas-table-header', child.from, child.to, decos);
    } else if (child.name === 'TableRow') {
      safeMark('atlas-table-row', child.from, child.to, decos);
    }
  }
}

function decorateTaskList(state: EditorState, ref: SyntaxNodeRef, decos: Range<Decoration>[]) {
  for (const child of iterChildren(ref)) {
    if (child.name === 'TaskMarker' && child.from < child.to) {
      const text = state.doc.sliceString(child.from, child.to);
      const checked = text.includes('x') || text.includes('X');
      decos.push(Decoration.replace({ widget: new TaskCheckboxWidget(checked) }).range(child.from, child.to));
    }
  }
}

function decorateImage(ref: SyntaxNodeRef, decos: Range<Decoration>[]) {
  safeMark('atlas-image', ref.from, ref.to, decos);
  for (const child of iterChildren(ref)) {
    if (child.name === 'LinkMark') hideRange(child.from, child.to, decos);
  }
}

// ─── Syntax tree helpers ─────────────────────────────────────────

/**
 * Return true if `pos` falls inside a FencedCode, InlineCode, or
 * CodeBlock node in the syntax tree. Uses `resolve(pos)` which walks
 * the tree at the exact position — safer than pre-collecting ranges
 * via `iterate()` (which can miss nodes that overlap visible-range
 * boundaries).
 */
function isInsideCodeBlock(state: EditorState, pos: number): boolean {
  const node = syntaxTree(state).resolve(pos, -1);
  if (!node) return false;
  const name = node.name;
  if (name === 'FencedCode' || name === 'InlineCode' || name === 'CodeBlock') return true;
  let cur: SyntaxNode | null = node.parent;
  while (cur) {
    if (cur.name === 'FencedCode' || cur.name === 'InlineCode' || cur.name === 'CodeBlock') return true;
    cur = cur.parent;
  }
  return false;
}

// ─── Wiki-links & @tags (regex pass) ────────────────────────────────

const WIKI_LINK_RE = /\[\[([^\]\n]+)\]\]/g;
const TAG_RE = /(^|[\s(])@([a-zA-Z][\w/-]*)/g;

function decorateWikiLinksAndTags(view: EditorView, decos: Range<Decoration>[]) {
  const state = view.state;
  for (const { from, to } of view.visibleRanges) {
    const text = state.doc.sliceString(from, to);
    let m: RegExpExecArray | null;

    WIKI_LINK_RE.lastIndex = 0;
    while ((m = WIKI_LINK_RE.exec(text))) {
      const start = from + m.index;
      const end = start + m[0].length;
      if (isInsideCodeBlock(state, start) || isInsideCodeBlock(state, end - 1)) continue;
      decos.push(Decoration.mark({ class: 'atlas-wikilink' }).range(start, end));
    }

    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(text))) {
      const tagStart = from + m.index + m[1].length;
      const tagEnd = tagStart + m[2].length + 1; // include the '@'
      if (isInsideCodeBlock(state, tagStart) || isInsideCodeBlock(state, tagEnd - 1)) continue;
      decos.push(Decoration.mark({ class: 'atlas-tag' }).range(tagStart, tagEnd));
    }
  }
}

// ─── Highlights & comments (regex pass) ──────────────────────────

const HIGHLIGHT_RE = /==([^=]+)==/g;
const COMMENT_RE = /<!--c:(.+?)-->/g;

function decorateHighlightsAndComments(view: EditorView, decos: Range<Decoration>[]) {
  const state = view.state;

  for (const { from, to } of view.visibleRanges) {
    const text = state.doc.sliceString(from, to);

    HIGHLIGHT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HIGHLIGHT_RE.exec(text))) {
      const fullStart = from + m.index;
      const fullEnd = fullStart + m[0].length;
      if (isInsideCodeBlock(state, fullStart) || isInsideCodeBlock(state, fullEnd - 1)) continue;
      const contentStart = fullStart + 2; // after ==
      const contentEnd = fullEnd - 2;     // before ==
      // Hide the == marks (use mark-based hiding to avoid DOM↔doc mapping issues)
      hideRangeMark(fullStart, contentStart, decos);
      hideRangeMark(contentEnd, fullEnd, decos);
      // Highlight the content
      safeMark('atlas-highlight', contentStart, contentEnd, decos);
    }

    COMMENT_RE.lastIndex = 0;
    while ((m = COMMENT_RE.exec(text))) {
      const start = from + m.index;
      const end = start + m[0].length;
      if (isInsideCodeBlock(state, start) || isInsideCodeBlock(state, end - 1)) continue;
      // Hide the entire comment markup (mark-based to avoid mapping corruption)
      hideRangeMark(start, end, decos);
    }
  }
}

// ─── HTML <aside> blocks (regex pass) ────────────────────────────

const ASIDE_RE = /<aside(\s[^>]*)?>([\s\S]*?)<\/aside>/g;

function decorateAsideBlocks(view: EditorView, decos: Range<Decoration>[]) {
  const state = view.state;
  for (const { from, to } of view.visibleRanges) {
    const text = state.doc.sliceString(from, to);
    ASIDE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ASIDE_RE.exec(text))) {
      const fullStart = from + m.index;
      const innerStart = fullStart + m[0].indexOf('>') + 1;
      const innerEnd = fullStart + m[0].lastIndexOf('</aside>');
      const fullEnd = fullStart + m[0].length;
      if (isInsideCodeBlock(state, fullStart) || isInsideCodeBlock(state, fullEnd - 1)) continue;
      // Hide the opening and closing tags (mark-based to avoid mapping corruption)
      hideRangeMark(fullStart, innerStart, decos);
      hideRangeMark(innerEnd, fullEnd, decos);
      // Style the content as an aside block
      safeMark('atlas-aside', innerStart, innerEnd, decos);
    }
  }
}

/** Find a comment adjacent to a position (looks forward up to 50 chars). */
export function findCommentAt(state: { doc: { sliceString: (from: number, to: number) => string }; length: number }, pos: number): string | null {
  const slice = state.doc.sliceString(pos, Math.min(pos + 50, state.length));
  const m = COMMENT_RE.exec(slice);
  COMMENT_RE.lastIndex = 0;
  return m ? m[1].trim() : null;
}

// ─── Main builder ────────────────────────────────────────────────

function buildDecorations(view: EditorView, mode: LivePreviewMode): DecorationSet {
  // Mode 2 = completely off — raw markdown, no decorations.
  if (mode === 2) return Decoration.none;

  const decos: Range<Decoration>[] = [];
  const state = view.state;

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (ref) => {
        const heading = HEADING_RE.exec(ref.name);
        if (heading) {
          decorateHeading(state, ref, Number(heading[1]), decos);
          return;
        }
        if (ref.name === 'StrongEmphasis') return decorateEmphasisLike(ref, 'atlas-strong', decos);
        if (ref.name === 'Emphasis') return decorateEmphasisLike(ref, 'atlas-em', decos);
        if (ref.name === 'InlineCode') return decorateInlineCode(ref, decos);
        if (ref.name === 'Link') return decorateLink(ref, decos);
        if (ref.name === 'FencedCode') return decorateFencedCode(ref, decos);
        if (ref.name === 'Quote') return decorateQuote(ref, decos);
        if (ref.name === 'HorizontalRule') {
          decos.push(Decoration.replace({ widget: new HrWidget() }).range(ref.from, ref.to));
          return;
        }
        if (ref.name === 'ListMark') {
          decos.push(Decoration.mark({ class: 'atlas-listmark' }).range(ref.from, ref.to));
          return;
        }
        if (ref.name === 'Strikethrough') return decorateStrikethrough(ref, decos);
        if (ref.name === 'Table') return decorateTable(ref, decos);
        if (ref.name === 'TaskList') return decorateTaskList(state, ref, decos);
        if (ref.name === 'Image') return decorateImage(ref, decos);
      },
    });
  }

  // Mode 1 = syntax tree only — skip the regex-based passes that are the
  // most likely source of false-positive decorations when text is pasted
  // from external sources (the regexes don't respect code fences/inline code).
  if (mode === 0) {
    decorateHighlightsAndComments(view, decos);
    decorateWikiLinksAndTags(view, decos);
    decorateAsideBlocks(view, decos);
  }

  return Decoration.set(decos, true);
}

// ─── Plugin export ───────────────────────────────────────────────

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    mode: LivePreviewMode;
    constructor(view: EditorView) {
      this.mode = view.state.field(livePreviewModeField);
      this.decorations = buildDecorations(view, this.mode);
    }
    update(update: ViewUpdate) {
      const newMode = update.state.field(livePreviewModeField);
      const modeChanged = newMode !== this.mode;
      if (modeChanged || update.docChanged || update.viewportChanged || update.selectionSet) {
        this.mode = newMode;
        this.decorations = buildDecorations(update.view, newMode);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

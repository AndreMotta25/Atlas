import { EditorState, Range } from '@codemirror/state';
import {
  EditorView,
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  WidgetType,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNodeRef } from '@lezer/common';

/**
 * Live Preview para o editor Atlas.
 *
 * Regras:
 * - Esconde a marcação (##, **, *, `, [], (), >) e aplica tipografia.
 * - O preview é aplicado em TODAS as linhas, inclusive na linha ativa.
 * - Wiki-links ([[pagina]]) e tags (#tag) não são parseados pela gramática
 *   padrão; tratamos via regex em texto "livre".
 */

const HEADING_RE = /^ATXHeading(\d)$/;

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

// ─── Helpers ─────────────────────────────────────────────────────

function hideRange(from: number, to: number, decos: Range<Decoration>[]) {
  decos.push(Decoration.replace({}).range(from, to));
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
    if (child.name === 'CodeMark' || child.name === 'CodeInfo') {
      hideRange(child.from, child.to, decos);
    }
  }
}

function decorateQuote(ref: SyntaxNodeRef, decos: Range<Decoration>[]) {
  decos.push(Decoration.mark({ class: 'atlas-quote' }).range(ref.from, ref.to));
}

// ─── Wiki-links & tags (regex pass) ──────────────────────────────

const WIKI_LINK_RE = /\[\[([^\]\n]+)\]\]/g;
const TAG_RE = /(^|[\s(])#([a-zA-Z][\w/-]*)/g;

function decorateWikiLinksAndTags(view: EditorView, decos: Range<Decoration>[]) {
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let m: RegExpExecArray | null;

    WIKI_LINK_RE.lastIndex = 0;
    while ((m = WIKI_LINK_RE.exec(text))) {
      const start = from + m.index;
      const end = start + m[0].length;
      decos.push(Decoration.mark({ class: 'atlas-wikilink' }).range(start, end));
    }

    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(text))) {
      const tagStart = from + m.index + m[1].length;
      const tagEnd = tagStart + m[2].length + 1; // include the '#'
      decos.push(Decoration.mark({ class: 'atlas-tag' }).range(tagStart, tagEnd));
    }
  }
}

// ─── Highlights & comments (regex pass) ──────────────────────────

const HIGHLIGHT_RE = /==([^=]+)==/g;
const COMMENT_RE = /<!--c:(.+?)-->/g;

// ─── HTML <aside> blocks ──────────────────────────────────────────

const ASIDE_RE = /<aside(\s[^>]*)?>([\s\S]*?)<\/aside>/g;

function decorateAsideBlocks(view: EditorView, decos: Range<Decoration>[]) {
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    ASIDE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ASIDE_RE.exec(text))) {
      const fullStart = from + m.index;
      const innerStart = fullStart + m[0].indexOf('>') + 1;
      const innerEnd = fullStart + m[0].lastIndexOf('</aside>');
      const fullEnd = fullStart + m[0].length;
      // Hide the opening and closing tags
      hideRange(fullStart, innerStart, decos);
      hideRange(innerEnd, fullEnd, decos);
      // Style the content as an aside block
      decos.push(
        Decoration.mark({ class: 'atlas-aside' }).range(innerStart, innerEnd),
      );
    }
  }
}

// ─── Highlights & comments (regex pass) ──────────────────────────

function decorateHighlightsAndComments(view: EditorView, decos: Range<Decoration>[]) {
  const state = view.state;

  for (const { from, to } of view.visibleRanges) {
    const text = state.doc.sliceString(from, to);

    HIGHLIGHT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HIGHLIGHT_RE.exec(text))) {
      const fullStart = from + m.index;
      const fullEnd = fullStart + m[0].length;
      const contentStart = fullStart + 2; // after ==
      const contentEnd = fullEnd - 2;     // before ==
      // Hide the == marks
      hideRange(fullStart, contentStart, decos);
      hideRange(contentEnd, fullEnd, decos);
      // Highlight the content
      decos.push(Decoration.mark({ class: 'atlas-highlight' }).range(contentStart, contentEnd));
    }

    COMMENT_RE.lastIndex = 0;
    while ((m = COMMENT_RE.exec(text))) {
      const start = from + m.index;
      const end = start + m[0].length;
      // Always hide the entire comment markup — comments only appear in the sidebar
      hideRange(start, end, decos);
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

function buildDecorations(view: EditorView): DecorationSet {
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
      },
    });
  }

  decorateHighlightsAndComments(view, decos);
  decorateWikiLinksAndTags(view, decos);
  decorateAsideBlocks(view, decos);

  return Decoration.set(decos, true);
}

// ─── Plugin export ───────────────────────────────────────────────

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

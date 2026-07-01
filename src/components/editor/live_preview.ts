import { EditorState, Range, StateEffect, StateField } from '@codemirror/state';
import {
  EditorView,
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  WidgetType,
} from '@codemirror/view';
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';
import { parseAnnotation } from './comment_parser';
import { ImageWidget, resolveImageSrc } from './image_widget';

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

// ─── Table rendering (GFM) ───────────────────────────────────────

interface ParsedTable {
  headers: string[];
  rows: string[][];
  aligns: ('left' | 'center' | 'right' | null)[];
}

/** Parse a single delimiter cell (e.g. ":--", "--:", ":-:") into an alignment. */
function parseDelimiterAlign(s: string): 'left' | 'center' | 'right' | null {
  const left = s.startsWith(':');
  const right = s.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

/** Walks Table syntax node children and collects plain-text cell contents. */
function parseTableFromNode(state: EditorState, ref: SyntaxNodeRef): ParsedTable {
  const headers: string[] = [];
  const rows: string[][] = [];
  let aligns: ('left' | 'center' | 'right' | null)[] = [];

  for (const child of iterChildren(ref)) {
    if (child.name === 'TableHeader') {
      for (const cell of iterChildren(child)) {
        if (cell.name === 'TableCell') {
          headers.push(state.doc.sliceString(cell.from, cell.to).trim());
        }
      }
    } else if (child.name === 'TableRow') {
      const row: string[] = [];
      for (const cell of iterChildren(child)) {
        if (cell.name === 'TableCell') {
          row.push(state.doc.sliceString(cell.from, cell.to).trim());
        }
      }
      rows.push(row);
    } else if (child.name === 'TableDelimiter') {
      const cells: string[] = [];
      for (const cell of iterChildren(child)) {
        if (cell.name === 'TableCell') {
          cells.push(state.doc.sliceString(cell.from, cell.to).trim());
        }
      }
      aligns = cells.map(parseDelimiterAlign);
    }
  }

  return { headers, rows, aligns };
}

/** True if the main selection intersects [from, to] — used to reveal raw markdown for editing. */
function selectionIntersectsTable(state: EditorState, from: number, to: number): boolean {
  const sel = state.selection.main;
  return sel.from <= to && sel.to >= from;
}

/**
 * Replaces the whole Table block with a real `<table>` element.
 * Returns false from ignoreEvent so clicks propagate to CodeMirror,
 * which positions the cursor inside the table range — at which point
 * selectionIntersectsTable returns true and decorateTable falls back
 * to the styled raw-text view, letting the user edit.
 */
class TableWidget extends WidgetType {
  constructor(readonly parsed: ParsedTable) {
    super();
  }

  eq(other: TableWidget) {
    const a = this.parsed;
    const b = other.parsed;
    if (a.headers.length !== b.headers.length) return false;
    if (a.rows.length !== b.rows.length) return false;
    if (a.aligns.length !== b.aligns.length) return false;
    for (let i = 0; i < a.headers.length; i++) {
      if (a.headers[i] !== b.headers[i]) return false;
      if (a.aligns[i] !== b.aligns[i]) return false;
    }
    for (let r = 0; r < a.rows.length; r++) {
      if (a.rows[r].length !== b.rows[r].length) return false;
      for (let c = 0; c < a.rows[r].length; c++) {
        if (a.rows[r][c] !== b.rows[r][c]) return false;
      }
    }
    return true;
  }

  toDOM() {
    const { headers, rows, aligns } = this.parsed;
    const table = document.createElement('table');
    table.className = 'atlas-rt';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    headers.forEach((h, i) => {
      const th = document.createElement('th');
      th.className = 'atlas-rt-th';
      th.textContent = h;
      const align = aligns[i];
      if (align) th.style.textAlign = align;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      row.forEach((cell, i) => {
        const td = document.createElement('td');
        td.className = 'atlas-rt-td';
        td.textContent = cell;
        const align = aligns[i];
        if (align) td.style.textAlign = align;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    return table;
  }

  ignoreEvent() {
    return false;
  }
}

function decorateTable(ref: SyntaxNodeRef, decos: Range<Decoration>[]) {
  // Mark-based styling for the raw-text view (always applied; visually hidden
  // when the StateField-provided widget decoration covers this range).
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

/**
 * Build block-level widget decorations for every Table in the document
 * whose range does NOT intersect the current selection. Block decorations
 * can't come from a ViewPlugin (CodeMirror throws), so this runs in a
 * dedicated StateField. When the cursor is inside a table, no widget is
 * emitted for it — the ViewPlugin's mark-based styling takes over and the
 * user sees the raw markdown for editing.
 */
function buildTableWidgetDecorations(state: EditorState): DecorationSet {
  // Force parse up to end of doc with a small timeout. Tables are usually
  // small and parsing is fast — this ensures newly-typed tables outside the
  // current viewport get recognized instead of falling back to mark styling.
  ensureSyntaxTree(state, state.doc.length, 50);
  const decos: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter: (ref) => {
      if (ref.name !== 'Table') return;
      if (selectionIntersectsTable(state, ref.from, ref.to)) return;
      const parsed = parseTableFromNode(state, ref);
      decos.push(
        Decoration.replace({
          widget: new TableWidget(parsed),
          block: true,
        }).range(ref.from, ref.to),
      );
    },
  });
  return Decoration.set(decos, true);
}

/** StateField providing block-level table widget decorations. */
export const tableWidgetField = StateField.define<DecorationSet>({
  create(state) {
    return buildTableWidgetDecorations(state);
  },
  update(value, tr) {
    const prev = tr.startState.selection.main;
    const next = tr.selection?.main ?? prev;
    const selChanged = prev.from !== next.from || prev.to !== next.to;
    const vpChanged = tr.effects.some((e) => e.is(tableViewportEffect));
    if (tr.docChanged || selChanged || vpChanged) {
      return buildTableWidgetDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * Effect dispatched by {@link tableViewportPlugin} when the viewport changes
 * (scroll / resize / parse completion). The StateField can't observe viewport
 * directly — it only sees transactions — so we translate viewport updates
 * into an effect.
 */
const tableViewportEffect = StateEffect.define<void>();

/**
 * ViewPlugin whose only job is to watch for viewport changes and notify the
 * StateField. Without this, scrolling a new table into view wouldn't rebuild
 * the widget — only the ViewPlugin's mark-based styling would update.
 */
export const tableViewportPlugin = ViewPlugin.fromClass(
  class {
    update(u: ViewUpdate) {
      if (u.viewportChanged) {
        u.view.dispatch({ effects: tableViewportEffect.of() });
      }
    }
  },
);

function decorateTaskList(state: EditorState, ref: SyntaxNodeRef, decos: Range<Decoration>[]) {
  for (const child of iterChildren(ref)) {
    if (child.name === 'TaskMarker' && child.from < child.to) {
      const text = state.doc.sliceString(child.from, child.to);
      const checked = text.includes('x') || text.includes('X');
      decos.push(Decoration.replace({ widget: new TaskCheckboxWidget(checked) }).range(child.from, child.to));
    }
  }
}

/**
 * Apply raw-text styling for an Image node ONLY when the selection intersects
 * it (editing mode). When the selection is outside, `imageWidgetField` emits a
 * block widget that replaces the whole range — emitting competing mark/replace
 * decorations here would conflict with it and prevent `toDOM()` from running.
 */
function decorateImage(view: EditorView, ref: SyntaxNodeRef, decos: Range<Decoration>[]) {
  const sel = view.state.selection.main;
  const intersects = sel.from <= ref.to && sel.to >= ref.from;
  if (!intersects) return;
  safeMark('atlas-image', ref.from, ref.to, decos);
  for (const child of iterChildren(ref)) {
    if (child.name === 'LinkMark') hideRange(child.from, child.to, decos);
  }
}

/** Extract the URL and alt text from an Image syntax node. */
function parseImageNode(state: EditorState, ref: SyntaxNodeRef): { url: string; alt: string } | null {
  let url = '';
  let alt = '';
  for (const child of iterChildren(ref)) {
    if (child.name === 'URL') {
      url = state.doc.sliceString(child.from, child.to).trim();
    } else if (child.name === 'LinkLabel') {
      // Reference-style images — not common here, skip for now.
    }
  }
  // Alt text: the inline content between ![ and ]. Walk children to collect text.
  // For simplicity, take the raw text inside the node minus the URL/LinkMark parts.
  // Most reliable: slice from after '!' to the ']('.
  const full = state.doc.sliceString(ref.from, ref.to);
  const m = /^!\[([\s\S]*?)\]\(([\s\S]*?)\)$/.exec(full);
  if (m) {
    alt = m[1];
    url = m[2];
  }
  if (!url) return null;
  return { url, alt };
}

/** True if the main selection intersects [from, to] — used to reveal raw markdown for editing. */
function selectionIntersectsImage(state: EditorState, from: number, to: number): boolean {
  const sel = state.selection.main;
  return sel.from <= to && sel.to >= from;
}

/**
 * Build block-level widget decorations for every Image in the document whose
 * range does NOT intersect the current selection. Same pattern as
 * `buildTableWidgetDecorations` — block decorations can't come from a ViewPlugin.
 */
function buildImageWidgetDecorations(state: EditorState): DecorationSet {
  ensureSyntaxTree(state, state.doc.length, 50);
  const decos: Range<Decoration>[] = [];
  let foundImages = 0;
  let skippedBySelection = 0;
  syntaxTree(state).iterate({
    enter: (ref) => {
      if (ref.name !== 'Image') return;
      foundImages++;
      if (selectionIntersectsImage(state, ref.from, ref.to)) {
        skippedBySelection++;
        return;
      }
      const parsed = parseImageNode(state, ref);
      if (!parsed) {
        console.warn('[imageWidget] could not parse Image node at', ref.from, ref.to);
        return;
      }
      const resolved = resolveImageSrc(parsed.url);
      console.log('[imageWidget] emit widget at', ref.from, '-', ref.to, 'url=', parsed.url, 'resolved=', resolved);
      decos.push(
        Decoration.replace({
          widget: new ImageWidget(resolved, parsed.alt),
          block: true,
        }).range(ref.from, ref.to),
      );
    },
  });
  if (foundImages > 0) {
    console.log('[imageWidget] foundImages=', foundImages, 'skippedBySelection=', skippedBySelection, 'decorations=', decos.length);
  }
  return Decoration.set(decos, true);
}

/** StateField providing block-level image widget decorations. */
export const imageWidgetField = StateField.define<DecorationSet>({
  create(state) {
    return buildImageWidgetDecorations(state);
  },
  update(value, tr) {
    const prev = tr.startState.selection.main;
    const next = tr.selection?.main ?? prev;
    const selChanged = prev.from !== next.from || prev.to !== next.to;
    const vpChanged = tr.effects.some((e) => e.is(imageViewportEffect));
    if (tr.docChanged || selChanged || vpChanged) {
      return buildImageWidgetDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * Effect dispatched by {@link imageViewportPlugin} when the viewport changes.
 * Mirrors {@link tableViewportEffect} — without this, scrolling new images
 * into view wouldn't rebuild the widget.
 */
const imageViewportEffect = StateEffect.define<void>();

/** ViewPlugin that re-dispatches viewport changes as an effect for the StateField. */
export const imageViewportPlugin = ViewPlugin.fromClass(
  class {
    update(u: ViewUpdate) {
      if (u.viewportChanged) {
        u.view.dispatch({ effects: imageViewportEffect.of() });
      }
    }
  },
);

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
const TAG_RE = /(^|[\s(])@([\p{L}][\p{L}\p{N}/_-]*)/gu;

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

// `[\s\S]+?` (instead of `[^=]+`) allows `=` and newlines inside highlights.
const HIGHLIGHT_RE = /==([\s\S]+?)==/g;
// `[\s\S]+?` allows multi-line annotations (encoded comments may wrap lines).
// The `^` anchor ensures the annotation is *adjacent* to the highlight.
const ANNOTATION_RE = /^<!--c:([\s\S]+?)-->/;

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

      // Look for comment annotation right after the highlight. The window
      // must be large enough to fit the longest encoded annotation.
      const after = state.doc.sliceString(fullEnd, Math.min(fullEnd + 200, state.doc.length));
      const cm = ANNOTATION_RE.exec(after);
      let color = 'yellow';
      if (cm) {
        const parsed = parseAnnotation(cm[1]);
        color = parsed.color;
        // Hide the comment markup. The annotation is plain text in a
        // paragraph (not inside any syntax-tree node), so Decoration.replace
        // is safe here and avoids the hit-testing issues that mark-based
        // hiding causes for clicks/selections AFTER the annotation.
        hideRange(fullEnd, fullEnd + cm[0].length, decos);
      }

      // Hide the == marks (use mark-based hiding to avoid DOM↔doc mapping issues)
      hideRangeMark(fullStart, contentStart, decos);
      hideRangeMark(contentEnd, fullEnd, decos);
      // Apply color-specific highlight
      safeMark(`atlas-highlight atlas-hl-${color}`, contentStart, contentEnd, decos);
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
        if (ref.name === 'Image') return decorateImage(view, ref, decos);
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

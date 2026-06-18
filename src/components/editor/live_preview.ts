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
 * Live Preview para o editor Atlas (estilo Obsidian).
 *
 * Regras:
 * - Esconde a marcação (##, **, *, `, [], (), >) e aplica tipografia.
 * - Na linha onde o cursor está, NADA é decorado — o usuário vê o markdown cru
 *   pra poder editar (mesmo comportamento do Obsidian Live Preview).
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

// ─── Cursor line detection ───────────────────────────────────────

function cursorLineRange(state: EditorState): { from: number; to: number } {
  const line = state.doc.lineAt(state.selection.main.head);
  return { from: line.from, to: line.to };
}

function overlapsCursorLine(
  from: number,
  to: number,
  cursor: { from: number; to: number },
): boolean {
  return !(to < cursor.from || from > cursor.to);
}

// ─── Wiki-links & tags (regex pass) ──────────────────────────────

const WIKI_LINK_RE = /\[\[([^\]\n]+)\]\]/g;
const TAG_RE = /(^|[\s(])#([a-zA-Z][\w/-]*)/g;

function decorateWikiLinksAndTags(
  view: EditorView,
  decos: Range<Decoration>[],
  cursor: { from: number; to: number },
) {
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let m: RegExpExecArray | null;

    WIKI_LINK_RE.lastIndex = 0;
    while ((m = WIKI_LINK_RE.exec(text))) {
      const start = from + m.index;
      const end = start + m[0].length;
      if (overlapsCursorLine(start, end, cursor)) continue;
      decos.push(Decoration.mark({ class: 'atlas-wikilink' }).range(start, end));
    }

    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(text))) {
      const tagStart = from + m.index + m[1].length;
      const tagEnd = tagStart + m[2].length + 1; // include the '#'
      if (overlapsCursorLine(tagStart, tagEnd, cursor)) continue;
      decos.push(Decoration.mark({ class: 'atlas-tag' }).range(tagStart, tagEnd));
    }
  }
}

// ─── Main builder ────────────────────────────────────────────────

function buildDecorations(view: EditorView): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const state = view.state;
  const cursor = cursorLineRange(state);

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (ref) => {
        if (overlapsCursorLine(ref.from, ref.to, cursor)) {
          return; // skip cursor line entirely — raw markdown for editing
        }

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

  decorateWikiLinksAndTags(view, decos, cursor);

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

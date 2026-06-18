import { EditorSelection, EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

const PLACEHOLDER = 'texto';

/**
 * Wrap the current selection (or insert placeholder) with prefix/suffix.
 * e.g. wrapSelection(view, '**', '**') for bold.
 */
export function wrapSelection(view: EditorView, prefix: string, suffix: string = prefix): void {
  const sel = view.state.selection.main;
  const selected = view.state.doc.sliceString(sel.from, sel.to);
  const hasSel = selected.length > 0;
  const inner = hasSel ? selected : PLACEHOLDER;
  const insert = `${prefix}${inner}${suffix}`;

  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
    selection: EditorSelection.range(
      sel.from + prefix.length,
      sel.from + prefix.length + inner.length,
    ),
  });
  view.focus();
}

/** Strip a leading heading/list/quote mark from a line, returning the body. */
function stripLinePrefix(text: string): string {
  return text.replace(/^(#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/, '');
}

/**
 * Replace the prefix of every line that overlaps the selection.
 * `prefix` is the full new prefix (e.g. '##', '>', '-') — a space is appended.
 * If the line already starts with that prefix, it's removed (toggle behaviour).
 */
export function toggleLinePrefix(view: EditorView, prefix: string): void {
  const sel = view.state.selection.main;
  const startLine = view.state.doc.lineAt(sel.from);
  const endLine = view.state.doc.lineAt(sel.to);
  const changes: { from: number; to: number; insert: string }[] = [];

  for (let num = startLine.number; num <= endLine.number; num++) {
    const line = view.state.doc.line(num);
    const stripped = stripLinePrefix(line.text);
    const fullPrefix = `${prefix} `;
    const already = line.text.startsWith(fullPrefix);
    const newText = already ? stripped : `${fullPrefix}${stripped}`;
    changes.push({ from: line.from, to: line.to, insert: newText });
  }

  view.dispatch({ changes });
  view.focus();
}

/** Heading prefix — strips any existing heading mark and applies `level` #'s. */
export function setHeading(view: EditorView, level: number): void {
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.from);
  // Remove existing heading marks but keep list/quote prefixes stripped too.
  const stripped = line.text.replace(/^#{1,6}\s+/, '').replace(/^(>\s*|[-*+]\s+)/, '');
  const hashes = '#'.repeat(level);
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: `${hashes} ${stripped}` },
  });
  view.focus();
}

/** Insert a horizontal rule on its own line at the cursor. */
export function insertHorizontalRule(view: EditorView): void {
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.from);
  const atLineStart = sel.from === line.from;
  const prefix = atLineStart ? '' : '\n\n';
  const suffix = '\n\n';
  const insert = `${prefix}---${suffix}`;
  const anchor = sel.from + prefix.length + 3 + suffix.length;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
    selection: EditorSelection.cursor(anchor),
  });
  view.focus();
}

/** Insert a markdown link `[text](url)` around the selection or at cursor. */
export function insertLink(view: EditorView): void {
  const sel = view.state.selection.main;
  const selected = view.state.doc.sliceString(sel.from, sel.to);
  const hasSel = selected.length > 0;
  const text = hasSel ? selected : PLACEHOLDER;
  const insert = `[${text}](url)`;
  // Place cursor on "url" for quick editing.
  const urlStart = sel.from + 1 + text.length + 2;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
    selection: EditorSelection.range(urlStart, urlStart + 3),
  });
  view.focus();
}

/** Indent or dedent the selected lines by two spaces (useful inside lists). */
export function changeIndent(view: EditorView, delta: 2 | -2): void {
  const state: EditorState = view.state;
  const sel = state.selection.main;
  const startLine = state.doc.lineAt(sel.from);
  const endLine = state.doc.lineAt(sel.to);
  const changes: { from: number; to: number; insert: string }[] = [];

  for (let num = startLine.number; num <= endLine.number; num++) {
    const line = state.doc.line(num);
    if (delta > 0) {
      changes.push({ from: line.from, to: line.from, insert: ' '.repeat(delta) });
    } else {
      const leading = line.text.slice(0, Math.min(-delta, line.text.length));
      if (/^\s+$/.test(leading)) {
        changes.push({ from: line.from, to: line.from + leading.length, insert: '' });
      }
    }
  }
  view.dispatch({ changes });
  view.focus();
}

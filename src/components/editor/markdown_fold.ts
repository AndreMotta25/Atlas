import { foldService } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

/**
 * Fold service for markdown: folds sections by heading level.
 *
 * When a line starts with ATXHeading (e.g., ## Section), the fold
 * range extends from the end of that heading line to:
 * - The start of the next heading of equal or higher level, OR
 * - The end of the document.
 */
const markdownFoldService = foldService.of(
  (state: EditorState, lineStart: number, _lineEnd: number) => {
    const line = state.doc.lineAt(lineStart);
    const match = /^(#{1,6})\s/.exec(line.text);
    if (!match) return null;

    const level = match[1].length;

    // Walk subsequent lines to find the next heading of equal or higher level
    for (let i = line.number + 1; i <= state.doc.lines; i++) {
      const nextLine = state.doc.line(i);
      const nextMatch = /^(#{1,6})\s/.exec(nextLine.text);
      if (nextMatch && nextMatch[1].length <= level) {
        return { from: line.to, to: nextLine.from };
      }
    }

    // No next heading — fold to end
    return { from: line.to, to: state.doc.length };
  },
);

export { markdownFoldService };

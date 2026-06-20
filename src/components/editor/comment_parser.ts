/**
 * Unified parser/serializer for the highlight + comment system.
 *
 * Storage format (inline in markdown):
 *
 *     ==highlighted text==<!--c:id=<id>|<encodedComment>|<color>-->
 *
 * - `id` is a short stable token so CRUD targets a specific occurrence
 *   even when duplicate highlights share the same text.
 * - `encodedComment` is `encodeURIComponent`-escaped, so `-->`, `|`,
 *   newlines and any other reserved char are safe inside an HTML comment.
 * - `color` is validated against `HIGHLIGHT_COLORS`; unknown values fall
 *   back to the default.
 *
 * Legacy format (`<!--c:comment|color-->` or `<!--c:|color-->`) is still
 * read for backwards compatibility; on the next write it is upgraded to
 * the new format with a freshly generated id.
 */

import { HIGHLIGHT_COLORS, DEFAULT_HIGHLIGHT_COLOR, type HighlightColor } from '../../types';

const VALID_COLORS: ReadonlySet<string> = new Set(
  HIGHLIGHT_COLORS.map((c) => c.value),
);

// `[\s\S]+?` (instead of `[^=]+`) allows `=` and newlines inside highlights.
const HIGHLIGHT_RE = /==([\s\S]+?)==/g;
// `[\s\S]+?` allows newlines inside the annotation body.
const ANNOTATION_RE = /<!--c:([\s\S]+?)-->/;

/** Generate a short opaque id for a new comment. */
export function genCommentId(): string {
  return (
    Math.random().toString(36).slice(2, 8) +
    Date.now().toString(36).slice(-4)
  );
}

function asColor(value: string | undefined): HighlightColor {
  return value && VALID_COLORS.has(value)
    ? (value as HighlightColor)
    : DEFAULT_HIGHLIGHT_COLOR;
}

function decodePart(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export interface ParsedAnnotation {
  id: string;
  comment: string;
  color: HighlightColor;
}

/** Parse the body of a `<!--c:...-->` annotation (supports legacy + new formats). */
export function parseAnnotation(raw: string): ParsedAnnotation {
  // `|` is reserved by the format; `encodeURIComponent` encodes any literal
  // `|` inside the comment to `%7C`, so a raw split is safe.
  const parts = raw.split('|');

  // New format: id=<id>|<encodedComment>|<color>
  if (parts[0].startsWith('id=')) {
    const id = parts[0].slice(3);
    const hasColor = parts.length >= 3;
    const color = hasColor ? asColor(parts[parts.length - 1]) : DEFAULT_HIGHLIGHT_COLOR;
    const commentEnd = hasColor ? parts.length - 1 : parts.length;
    const commentEncoded = parts.slice(1, commentEnd).join('|');
    return { id: id || genCommentId(), comment: decodePart(commentEncoded), color };
  }

  // Legacy format: <comment>|<color>  |  |<color>  |  <comment>
  const last = parts[parts.length - 1];
  if (parts.length > 1 && VALID_COLORS.has(last)) {
    return {
      id: genCommentId(),
      comment: decodePart(parts.slice(0, -1).join('|')),
      color: last as HighlightColor,
    };
  }
  return { id: genCommentId(), comment: decodePart(raw), color: DEFAULT_HIGHLIGHT_COLOR };
}

/** Serialize a comment + color + id into a `<!--c:...-->` annotation. */
export function serializeAnnotation(
  comment: string,
  color: HighlightColor,
  id: string,
): string {
  const encoded = encodeURIComponent(comment);
  return `<!--c:id=${id}|${encoded}|${color}-->`;
}

export interface CommentEntry {
  /** Stable id (new format) or freshly generated (legacy). */
  id: string;
  /** Doc offset of the leading `==`. */
  fullFrom: number;
  /** Doc offset one past the end of the annotation (or highlight). */
  fullTo: number;
  /** Doc offset of the highlighted content (after the opening `==`). */
  pos: number;
  /** Highlighted text (without surrounding `==`). */
  text: string;
  /** Trimmed comment body. Empty string for color-only highlights. */
  comment: string;
  /** Validated color. */
  color: HighlightColor;
}

/**
 * Find every `==...==<!--c:...-->` pair in the document.
 *
 * Highlights without an adjacent annotation are ignored (they are not part
 * of the comment system).
 */
export function findComments(doc: string): CommentEntry[] {
  const results: CommentEntry[] = [];
  HIGHLIGHT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HIGHLIGHT_RE.exec(doc))) {
    const fullStart = m.index;
    const fullEnd = fullStart + m[0].length;
    const text = m[1];

    // The annotation (if any) must be adjacent — no whitespace between the
    // closing `==` and the `<!--c:`. Look ahead a bounded window.
    const after = doc.slice(fullEnd, Math.min(fullEnd + 200, doc.length));
    const am = ANNOTATION_RE.exec(after);
    if (!am) {
      // Not a comment-bearing highlight — skip without consuming further.
      if (m.index === HIGHLIGHT_RE.lastIndex) HIGHLIGHT_RE.lastIndex++;
      continue;
    }

    const parsed = parseAnnotation(am[1]);
    const annEnd = fullEnd + am.index + am[0].length;
    results.push({
      id: parsed.id,
      fullFrom: fullStart,
      fullTo: annEnd,
      pos: fullStart + 2,
      text,
      comment: parsed.comment.trim(),
      color: parsed.color,
    });
    // Resume scanning past this annotation so nested/adjacent highlights
    // are not re-matched against the same annotation.
    HIGHLIGHT_RE.lastIndex = annEnd;
  }
  return results;
}

/** Locate the comment whose full range covers the given doc position. */
export function findCommentAtPos(doc: string, pos: number): CommentEntry | null {
  const list = findComments(doc);
  return list.find((c) => pos >= c.fullFrom && pos <= c.fullTo) ?? null;
}

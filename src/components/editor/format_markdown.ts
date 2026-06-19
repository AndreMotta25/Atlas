/**
 * Clean up markdown text with consistent formatting.
 *
 * Rules:
 *  - Trailing whitespace removed
 *  - Multiple blank lines collapsed to one
 *  - Blank line before headings (h1–h6) and horizontal rules
 *  - List markers normalized (single space after -, *, +, 1.)
 *  - Trailing blank lines trimmed, single newline at EOF
 *  - Content inside fenced code blocks preserved as-is
 */
export function formatMarkdown(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inFence = false;
  let prevBlank = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Strip trailing whitespace
    line = line.replace(/[ \t]+$/, '');

    const isBlank = line === '';

    // Track fenced code blocks — preserve content untouched
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      // Ensure blank line before opening fence (if not at start)
      if (inFence && !prevBlank && result.length > 0) {
        result.push('');
      }
      result.push(line);
      prevBlank = false;
      continue;
    }

    if (inFence) {
      result.push(line);
      prevBlank = isBlank;
      continue;
    }

    const isHeading = /^#{1,6}\s/.test(line);
    const isHr = /^[-*_]{3,}\s*$/.test(line);
    const isOrderedList = /^\s*\d+\.\s/.test(line);
    const isUnorderedList = /^\s*[-*+]\s/.test(line);
    const isList = isOrderedList || isUnorderedList;

    // Normalize list markers: ensure exactly one space after marker
    if (isUnorderedList) {
      line = line.replace(/^(\s*)([-*+])\s*/, (_m, indent, marker) => indent + marker + ' ');
    }
    if (isOrderedList) {
      line = line.replace(/^(\s*\d+\.)\s*/, '$1 ');
    }

    // Normalize horizontal rule to ---
    if (isHr) {
      line = '---';
    }

    // Collapse multiple blank lines
    if (isBlank) {
      if (prevBlank) continue;
      prevBlank = true;
      result.push('');
      continue;
    }

    // Ensure blank line before headings and horizontal rules
    if ((isHeading || isHr) && !prevBlank && result.length > 0) {
      result.push('');
    }

    result.push(line);
    prevBlank = false;
  }

  // Remove trailing blank lines
  while (result.length > 0 && result[result.length - 1] === '') {
    result.pop();
  }

  return result.join('\n') + '\n';
}

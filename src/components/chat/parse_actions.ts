/**
 * Extracts a `buttons` fenced block from assistant markdown content.
 *
 * Syntax (one label per line):
 *
 * ```buttons
 * Sim
 * Não
 * Talvez depois
 * ```
 *
 * The block is stripped from the rendered markdown and the labels are shown
 * as clickable buttons below the message. When the user clicks one, the label
 * is sent as the next user message — replacing the "type yes/no" back-and-forth.
 *
 * Only the first match is used. Labels are trimmed; empty lines are dropped.
 * Labels longer than 60 chars are truncated to keep the UI tidy.
 */

const BUTTONS_BLOCK = /```buttons\s*\n([\s\S]*?)\n?```\s*$/;
const MAX_LABEL_LEN = 60;

export interface ParsedActions {
  cleanContent: string;
  actions: string[];
}

export const parseActions = (content: string): ParsedActions => {
  const match = content.match(BUTTONS_BLOCK);
  if (!match) return { cleanContent: content, actions: [] };

  const raw = match[1];
  const actions = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => (l.length > MAX_LABEL_LEN ? l.slice(0, MAX_LABEL_LEN - 1) + '…' : l))
    .slice(0, 6); // cap at 6 buttons

  // Strip the block (and any trailing blank line before it) from rendered content.
  const cleanContent = content.slice(0, match.index).replace(/\s+$/, '');

  return { cleanContent, actions };
};

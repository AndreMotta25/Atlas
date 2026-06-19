import type { Diagnostic } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';
import { useVaultStore } from '../../stores/vault_store';
import type { VaultTree } from '../../types';

/** Recursively extract .md page paths (relative, no ext) from the vault tree. */
function flattenTree(node: VaultTree | null): string[] {
  if (!node) return [];
  const paths: string[] = [];
  function walk(n: VaultTree) {
    if (!n.isDir && n.path.endsWith('.md')) {
      paths.push(n.path.replace(/\.md$/, ''));
    }
    if (n.children) n.children.forEach(walk);
  }
  walk(node);
  return paths;
}

/**
 * Lint source that flags:
 * - Wiki-links pointing to non-existent pages
 * - Unclosed bold/italic formatting marks
 */
function markdownLintSource(view: EditorView): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const text = view.state.doc.toString();
  const tree = useVaultStore.getState().tree;
  const pages = flattenTree(tree);
  const pageSet = new Set(pages);

  // ── Broken wiki-links ──────────────────────────────────────────
  const wikiRE = /\[\[([^\]\n]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = wikiRE.exec(text))) {
    const raw = m[1];
    // Handle aliases: [[page|alias]] or anchors: [[page#section]]
    const pageName = raw.split('|')[0].split('#')[0].trim();
    if (pageName && !pageSet.has(pageName)) {
      diagnostics.push({
        from: m.index + 2,
        to: m.index + 2 + pageName.length,
        severity: 'warning',
        message: `Página "${pageName}" não encontrada`,
        source: 'atlas',
      });
    }
  }

  // ── Unclosed bold/italic ───────────────────────────────────────
  // Check each line for unpaired ** or * markers (skip code fences)
  const lines = text.split('\n');
  let pos = 0;
  let inFence = false;
  for (const line of lines) {
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      pos += line.length + 1;
      continue;
    }
    if (inFence) {
      pos += line.length + 1;
      continue;
    }

    // Unclosed bold
    const boldCount = (line.match(/\*\*/g) || []).length;
    if (boldCount % 2 !== 0) {
      diagnostics.push({
        from: pos,
        to: pos + line.length,
        severity: 'info',
        message: 'Possível negrito não fechado (**)',
        source: 'atlas',
      });
    }

    // Unclosed italic (single *, but don't match **)
    const italicStar = (line.match(/(?<!\*)\*(?!\*)/g) || []).length;
    if (italicStar % 2 !== 0) {
      diagnostics.push({
        from: pos,
        to: pos + line.length,
        severity: 'info',
        message: 'Possível itálico não fechado (*)',
        source: 'atlas',
      });
    }

    pos += line.length + 1;
  }

  return diagnostics;
}

export { markdownLintSource };

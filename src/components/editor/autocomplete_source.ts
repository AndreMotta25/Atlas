import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { useVaultStore } from '../../stores/vault_store';
import type { VaultTree } from '../../types';

/** Recursively extract .md page paths (relative, no ext) from the vault tree. */
function flattenTree(node: VaultTree | null): string[] {
  if (!node) return [];
  const paths: string[] = [];
  function walk(n: VaultTree) {
    if (!n.isDir && n.path.endsWith('.md')) {
      // Strip .md extension for wiki-link matching
      paths.push(n.path.replace(/\.md$/, ''));
    }
    if (n.children) n.children.forEach(walk);
  }
  walk(node);
  return paths;
}

/**
 * Autocomplete wiki-links: triggers when user types [[
 * Suggests page names from the vault.
 */
function wikiLinkSource(ctx: CompletionContext): CompletionResult | null {
  // Match [[ followed by any text that isn't ] or newline
  const match = ctx.matchBefore(/\[\[([^\][]*)$/);
  if (!match) return null;

  const query = match.text.slice(2).toLowerCase();
  const tree = useVaultStore.getState().tree;
  const pages = flattenTree(tree);

  const filtered = pages.filter((p) => p.toLowerCase().includes(query));
  if (filtered.length === 0) return null;

  return {
    from: match.from + 2, // after [[
    filter: false, // we already filtered
    options: filtered.map((p) => ({
      label: p,
      type: 'page' as const,
      apply: (view: EditorView, _completion, from, to) => {
        const doc = view.state.doc;
        const after = doc.sliceString(to, Math.min(to + 2, doc.length));
        const hasClose = after.startsWith(']]');
        const insert = hasClose ? p : `${p}]]`;
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + p.length },
        });
      },
    })),
    validFor: /^[^\]\n]*$/,
  };
}

/**
 * Autocomplete @tags: triggers after @ followed by word characters.
 * Scans current document + vault for existing tags.
 */
function tagSource(ctx: CompletionContext): CompletionResult | null {
  const match = ctx.matchBefore(/(?:^|[\s(])@([\w/-]*)$/);
  if (!match) return null;

  const atIndex = match.text.lastIndexOf('@');
  const query = match.text.slice(atIndex + 1).toLowerCase();

  // Collect tags from current document
  const docText = ctx.state.doc.toString();
  const tagRE = /(?:^|[\s(])@([\p{L}\p{N}/_-]+)/gu;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = tagRE.exec(docText))) {
    const tag = m[1].toLowerCase();
    if (tag.includes(query)) seen.add(m[1]);
  }

  // Also check known page paths for tag-like patterns
  const tree = useVaultStore.getState().tree;
  const pages = flattenTree(tree);
  for (const page of pages) {
    // Extract segments that look like tags from page paths
    const segments = page.split('/');
    for (const seg of segments) {
      if (seg.includes(query)) seen.add(seg);
    }
  }

  if (seen.size === 0) return null;

  return {
    from: match.from + atIndex + 1, // after @
    filter: false,
    options: [...seen].sort().map((t) => ({
      label: t,
      type: 'keyword' as const,
    })),
    validFor: /^[\w/-]*$/,
  };
}

/**
 * Atlas autocomplete sources: wiki-links [[ and @tags.
 * Pass to autocompletion({ override: [...] }).
 */
export const atlasCompletionSources = [wikiLinkSource, tagSource];

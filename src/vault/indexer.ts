import * as path from 'path';
import * as fsp from 'fs/promises';
import { DatabaseService } from './db';
import { VaultManager } from './manager';
import type { VaultTree } from '../types';

/**
 * Parses Markdown pages and feeds the SQLite index:
 *   - Title: first H1 in the document, falling back to the basename.
 *   - Wiki-links: [[Target]] or [[Target|Alias]] or [[path/to/target#heading|Alias]].
 *   - Tags: #tag (word chars + dash, not inside inline code).
 *
 * All DB writes go through DatabaseService; this module only handles parsing
 * and orchestration.
 */

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;
const TAG_RE = /(^|\s)#([\w][\w-]*)/g;
const H1_RE = /^\s*#\s+(.+?)\s*$/;
const CODE_FENCE_RE = /^(\s*)(`{3,}|~{3,})/;

interface ParsedLinks {
  toPath: string;
  anchor: string | null;
}

interface ParsedPage {
  title: string;
  links: ParsedLinks[];
  tags: string[];
}

const parsePage = (content: string): ParsedPage => {
  const lines = content.split('\n');
  let title = '';
  const links: ParsedLinks[] = [];
  const tags = new Set<string>();

  let inFence = false;
  let fenceMarker = '';

  for (const line of lines) {
    // Track fenced code blocks — skip link/tag extraction inside them.
    const fenceMatch = line.match(CODE_FENCE_RE);
    if (fenceMatch) {
      const marker = fenceMatch[2][0]; // ` or ~
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = '';
      }
      continue;
    }

    if (!title) {
      const h1 = line.match(H1_RE);
      if (h1) title = h1[1].trim();
    }

    if (!inFence) {
      // Inline code spans would false-positive on tags/links — strip them.
      const stripped = line.replace(/`[^`]*`/g, ' ');

      let m: RegExpExecArray | null;
      const linkRe = new RegExp(WIKI_LINK_RE.source, 'g');
      while ((m = linkRe.exec(stripped)) !== null) {
        const raw = m[1];
        // Split target | alias
        const pipeIdx = raw.indexOf('|');
        const targetPart = pipeIdx >= 0 ? raw.slice(0, pipeIdx) : raw;
        const alias = pipeIdx >= 0 ? raw.slice(pipeIdx + 1).trim() : null;
        // Split target # heading
        const hashIdx = targetPart.indexOf('#');
        const target = (hashIdx >= 0 ? targetPart.slice(0, hashIdx) : targetPart).trim();
        if (!target) continue;
        links.push({ toPath: normalizeTarget(target), anchor: alias });
      }

      const tagRe = new RegExp(TAG_RE.source, 'g');
      while ((m = tagRe.exec(stripped)) !== null) {
        tags.add(m[2].toLowerCase());
      }
    }
  }

  return { title: title || '', links, tags: [...tags] };
};

/**
 * Normalize a wiki-link target to a vault-relative `.md` path.
 *   - "Notas"            → "notas.md"
 *   - "pasta/Notas"      → "pasta/notas.md"
 *   - "../Outra"         → "outra.md"   (parent ref collapsed — best-effort)
 * Spaces are preserved (file names can contain them); only the extension is added.
 */
const normalizeTarget = (target: string): string => {
  let t = target.trim();
  // Collapse any parent-directory segments to keep things sane.
  t = t.replace(/\.\.\//g, '').replace(/\.\.\\g/, '');
  if (!/\.md$/i.test(t)) t += '.md';
  return t;
};

class IndexerClass {
  /** Index (or re-index) a single page from disk. No-op if the vault isn't set. */
  async indexPage(relPath: string): Promise<void> {
    const root = VaultManager.getRoot();
    if (!root) return;
    let content: string;
    let mtime: number;
    let size: number;
    try {
      const result = await VaultManager.readPage(relPath);
      content = result.content;
      const abs = path.join(root, relPath);
      const stat = await fsp.stat(abs);
      mtime = stat.mtimeMs;
      size = stat.size;
    } catch {
      // File gone or unreadable — let removePage handle cleanup upstream.
      return;
    }

    const parsed = parsePage(content);
    const baseName = path.basename(relPath, '.md');
    const title = parsed.title || baseName;

    const pageId = DatabaseService.upsertPage({
      path: relPath,
      title,
      mtime,
      size,
      content,
    });

    DatabaseService.replaceLinks(pageId, parsed.links);
    DatabaseService.replaceTags(pageId, parsed.tags);
  }

  /** Remove a page from the index (file deleted). */
  removePage(relPath: string): void {
    DatabaseService.removePage(relPath);
  }

  /** Full rebuild — walks the current vault tree and re-indexes every page. */
  async reindexAll(): Promise<void> {
    if (!VaultManager.isConfigured()) return;
    DatabaseService.clearAll();
    const tree = await VaultManager.readTree();
    const paths: string[] = [];
    const walk = (node: VaultTree): void => {
      if (!node.isDir) {
        paths.push(node.path);
      }
      node.children?.forEach(walk);
    };
    walk(tree);
    // Sequential — each indexPage is a small sync-ish DB transaction wrapped in one async read.
    for (const p of paths) {
      await this.indexPage(p);
    }
  }
}

export const Indexer = new IndexerClass();

import Database from 'better-sqlite3';
import type { Database as DB } from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import type { BacklinkResult, SearchResult } from '../types';

/**
 * SQLite layer for the Atlas vault index.
 *
 * Tables:
 *   - pages        (id, path UNIQUE, title, mtime, size)
 *   - links        (from_page → pages.id, to_path, anchor)
 *   - tags         (page_id → pages.id, tag)
 *   - pages_fts    (FTS5 over path/title/content — standalone, manually synced)
 *
 * FTS5 uses unicode61 with remove_diacritics=2 so accented Portuguese queries
 * match unaccented text and vice-versa.
 */
class DatabaseServiceClass {
  private db: DB | null = null;

  /** Open (or create) the DB file in userData. Idempotent. */
  open(): void {
    if (this.db) return;
    const dbPath = path.join(app.getPath('userData'), 'atlas.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private migrate(): void {
    if (!this.db) throw new Error('DB not open');
    const current = this.db.pragma('user_version', { simple: true }) as number;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pages (
        id    INTEGER PRIMARY KEY,
        path  TEXT UNIQUE NOT NULL,
        title TEXT,
        mtime INTEGER,
        size  INTEGER
      );

      CREATE TABLE IF NOT EXISTS links (
        from_page INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        to_path   TEXT NOT NULL,
        anchor    TEXT
      );

      CREATE TABLE IF NOT EXISTS tags (
        page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        tag     TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_links_from ON links(from_page);
      CREATE INDEX IF NOT EXISTS idx_links_to   ON links(to_path);
      CREATE INDEX IF NOT EXISTS idx_tags_tag   ON tags(tag);
      CREATE INDEX IF NOT EXISTS idx_tags_page  ON tags(page_id);

      CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
        path,
        title,
        content,
        tokenize = "unicode61 remove_diacritics 2 categories 'L* N* Co'"
      );
    `);

    if (current < 1) {
      this.db.pragma('user_version = 1');
    }
  }

  // ── Page upsert / remove ──────────────────────────────────────

  /**
   * Upsert a page's metadata and FTS content. Returns the page id.
   * Links and tags are NOT touched here — the Indexer handles them.
   */
  upsertPage(meta: {
    path: string;
    title: string | null;
    mtime: number;
    size: number;
    content: string;
  }): number {
    const db = this.requireOpen();
    const tx = db.transaction(() => {
      const existing = db.prepare(
        'SELECT id FROM pages WHERE path = ?',
      ).get(meta.path) as { id: number } | undefined;

      let id: number;
      if (existing) {
        db.prepare(
          'UPDATE pages SET title = ?, mtime = ?, size = ? WHERE id = ?',
        ).run(meta.title, meta.mtime, meta.size, existing.id);
        id = existing.id;
        // FTS5: delete old row then insert new.
        db.prepare("DELETE FROM pages_fts WHERE path = ?").run(meta.path);
      } else {
        const info = db.prepare(
          'INSERT INTO pages (path, title, mtime, size) VALUES (?, ?, ?, ?)',
        ).run(meta.path, meta.title, meta.mtime, meta.size);
        id = Number(info.lastInsertRowid);
      }
      db.prepare(
        'INSERT INTO pages_fts (rowid, path, title, content) VALUES (?, ?, ?, ?)',
      ).run(id, meta.path, meta.title ?? '', meta.content);
      return id;
    });
    return tx();
  }

  /** Remove a page and cascade-clean its links/tags and FTS row. */
  removePage(pagePath: string): void {
    const db = this.requireOpen();
    const tx = db.transaction(() => {
      const row = db.prepare('SELECT id FROM pages WHERE path = ?').get(
        pagePath,
      ) as { id: number } | undefined;
      if (!row) return;
      // FTS row keyed by rowid == pages.id.
      db.prepare('DELETE FROM pages_fts WHERE rowid = ?').run(row.id);
      // pages delete cascades to links + tags via FK.
      db.prepare('DELETE FROM pages WHERE id = ?').run(row.id);
    });
    tx();
  }

  /** Wipe everything — used when switching vaults or forcing a full rebuild. */
  clearAll(): void {
    if (!this.db) throw new Error('DB not open');
    this.db.exec(`
      DELETE FROM pages_fts;
      DELETE FROM links;
      DELETE FROM tags;
      DELETE FROM pages;
    `);
  }

  // ── Links / tags (called by Indexer) ───────────────────────────

  replaceLinks(pageId: number, links: Array<{ toPath: string; anchor: string | null }>): void {
    const db = this.requireOpen();
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM links WHERE from_page = ?').run(pageId);
      const stmt = db.prepare(
        'INSERT INTO links (from_page, to_path, anchor) VALUES (?, ?, ?)',
      );
      for (const l of links) stmt.run(pageId, l.toPath, l.anchor);
    });
    tx();
  }

  replaceTags(pageId: number, tags: string[]): void {
    const db = this.requireOpen();
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM tags WHERE page_id = ?').run(pageId);
      const stmt = db.prepare('INSERT INTO tags (page_id, tag) VALUES (?, ?)');
      for (const t of tags) stmt.run(pageId, t);
    });
    tx();
  }

  // ── Queries ───────────────────────────────────────────────────

  /** FTS5 content search ranked by BM25. Returns up to `limit` results. */
  search(query: string, limit = 20): SearchResult[] {
    const db = this.requireOpen();
    const trimmed = query.trim();
    if (!trimmed) return [];
    // Pass the raw user query through FTS5's query syntax (default OR for
    // multiple terms). Double-up internal double quotes so they don't break
    // the parser; any other syntax errors are caught below.
    const sanitized = trimmed.replace(/"/g, '""');
    try {
      const rows = db.prepare(`
        SELECT
          p.path          AS path,
          p.title         AS title,
          substring(coalesce(f.content, ''), 1, 240) AS snippet,
          bm25(pages_fts) AS rank
        FROM pages_fts f
        JOIN pages p ON p.id = f.rowid
        WHERE pages_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(sanitized, limit) as Array<{
        path: string;
        title: string | null;
        snippet: string;
        rank: number;
      }>;
      return rows.map((r) => ({
        path: r.path,
        title: r.title ?? r.path,
        snippet: r.snippet.replace(/\s+/g, ' ').trim(),
        rank: r.rank,
      }));
    } catch {
      // MATCH syntax errors (e.g., unbalanced quotes from user input) — bail gracefully.
      return [];
    }
  }

  /** Pages whose links point at `targetPath` (resolved against vault root). */
  getBacklinks(targetPath: string): BacklinkResult[] {
    const db = this.requireOpen();
    // Backlinks match on the target path, both with and without the .md extension,
    // since wiki-links are commonly written without it ([[notas]] → notas.md).
    const bare = targetPath.replace(/\.md$/i, '');
    const rows = db.prepare(`
      SELECT
        pf.path  AS fromPath,
        pf.title AS fromTitle,
        l.anchor AS anchor
      FROM links l
      JOIN pages pf ON pf.id = l.from_page
      WHERE l.to_path = ? OR l.to_path = ?
      ORDER BY pf.path
    `).all(targetPath, bare) as Array<{
      fromPath: string;
      fromTitle: string | null;
      anchor: string | null;
    }>;
    return rows.map((r) => ({
      fromPath: r.fromPath,
      fromTitle: r.fromTitle ?? r.fromPath,
      anchor: r.anchor,
    }));
  }

  /** Throws if the DB hasn't been opened. Use inside methods that use `db` in closures. */
  private requireOpen(): DB {
    if (!this.db) throw new Error('DB not open');
    return this.db;
  }
}

export const DatabaseService = new DatabaseServiceClass();

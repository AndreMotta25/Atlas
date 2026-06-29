import Database from 'better-sqlite3';
import type { Database as DB } from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import type { BacklinkResult, ChatMessage, ChatSearchResult, ChatSession, CreateVersionInput, GraphData, GraphEdge, GraphNode, PageVersion, PageVersionMeta, SearchResult, TagResult, TagPageResult } from '../types';

/**
 * SQLite layer for the Atlas vault index.
 *
 * Tables:
 *   - pages          (id, path UNIQUE, title, mtime, size)
 *   - links          (from_page → pages.id, to_path, anchor)
 *   - tags           (page_id → pages.id, tag)
 *   - pages_fts      (FTS5 over path/title/content — standalone, manually synced)
 *   - page_versions  (id, path, content, size, created_at, source, label)
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
    console.log('[db] opening:', dbPath);
    this.db = new Database(dbPath);
    try {
      this.db.pragma('journal_mode = WAL');
    } catch (err) {
      console.warn('[db] WAL unavailable, falling back to TRUNCATE:', err);
      this.db.pragma('journal_mode = TRUNCATE');
    }
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

      CREATE TABLE IF NOT EXISTS chat_sessions (
        id         TEXT PRIMARY KEY,
        title      TEXT,
        page_path  TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_page    ON chat_sessions(page_path);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

      CREATE TABLE IF NOT EXISTS chat_messages (
        id                 TEXT PRIMARY KEY,
        session_id         TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        role               TEXT NOT NULL,
        content            TEXT NOT NULL,
        tool_calls_json    TEXT,
        tool_results_json  TEXT,
        seq                INTEGER NOT NULL,
        created_at         INTEGER NOT NULL,
        UNIQUE(session_id, seq)
      );
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, seq);

      CREATE VIRTUAL TABLE IF NOT EXISTS chat_messages_fts USING fts5(
        content,
        message_id UNINDEXED,
        tokenize = "unicode61 remove_diacritics 2 categories 'L* N* Co'"
      );

      CREATE TABLE IF NOT EXISTS page_versions (
        id          INTEGER PRIMARY KEY,
        path        TEXT NOT NULL,
        content     TEXT NOT NULL,
        size        INTEGER NOT NULL,
        created_at  INTEGER NOT NULL,
        source      TEXT NOT NULL DEFAULT 'manual',
        label       TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_versions_path_time
        ON page_versions(path, created_at DESC);
    `);

    if (current < 1) {
      this.db.pragma('user_version = 1');
    }
    if (current < 2) {
      this.db.pragma('user_version = 2');
    }
    if (current < 3) {
      this.db.pragma('user_version = 3');
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

  // ── Tags ───────────────────────────────────────────────────────

  /** List all distinct tags with their page count, ordered by count descending. */
  listTags(): TagResult[] {
    const db = this.requireOpen();
    const rows = db.prepare(`
      SELECT tag, COUNT(page_id) AS count
      FROM tags
      GROUP BY tag
      ORDER BY count DESC, tag ASC
    `).all() as Array<{ tag: string; count: number }>;
    return rows;
  }

  /** Pages that contain a given tag. */
  getPagesByTag(tag: string): TagPageResult[] {
    const db = this.requireOpen();
    const rows = db.prepare(`
      SELECT p.path AS path, p.title AS title
      FROM tags t
      JOIN pages p ON p.id = t.page_id
      WHERE t.tag = ?
      ORDER BY p.path
    `).all(tag.toLowerCase()) as Array<{ path: string; title: string | null }>;
    return rows.map((r) => ({ path: r.path, title: r.title ?? r.path }));
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
    // Links are stored lowercased by the indexer (see normalizeTarget), so the
    // comparison must lowercase the input too — otherwise [[Notas]] would miss
    // backlinks to notas.md. Both with/without .md are tried because wiki-links
    // are commonly written without the extension.
    const normalized = targetPath.toLowerCase();
    const bare = normalized.replace(/\.md$/i, '');
    const rows = db.prepare(`
      SELECT
        pf.path  AS fromPath,
        pf.title AS fromTitle,
        l.anchor AS anchor
      FROM links l
      JOIN pages pf ON pf.id = l.from_page
      WHERE l.to_path = ? OR l.to_path = ?
      ORDER BY pf.path
    `).all(normalized, bare) as Array<{
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

  /**
   * Full graph of pages and the wiki-links between them. Used by the graph view.
   *
   * - Nodes: every indexed page, with `degree` = count of links in + out.
   * - Edges: one per link whose target resolves to an existing page.
   *   `links.to_path` is lowercased by the indexer (see normalizeTarget),
   *   so the join uses `LOWER(p.path)` to match case-insensitively.
   *   Links pointing at non-existing pages (dangling wiki-links) are dropped.
   */
  getGraph(): GraphData {
    const db = this.requireOpen();
    const nodeRows = db.prepare(`
      SELECT id, path, title,
        (SELECT COUNT(*) FROM links l WHERE l.from_page = p.id) AS out_deg,
        (SELECT COUNT(*) FROM links l WHERE l.to_path = LOWER(p.path)) AS in_deg
      FROM pages p
      ORDER BY id
    `).all() as Array<{ id: number; path: string; title: string | null; out_deg: number; in_deg: number }>;

    const nodes: GraphNode[] = nodeRows.map((r) => ({
      id: r.id,
      path: r.path,
      title: r.title ?? r.path,
      degree: r.out_deg + r.in_deg,
    }));

    const edgeRows = db.prepare(`
      SELECT l.from_page AS source, p.id AS target
      FROM links l
      JOIN pages p ON LOWER(p.path) = l.to_path
      WHERE p.id IS NOT NULL AND l.from_page <> p.id
    `).all() as Array<{ source: number; target: number }>;

    const edges: GraphEdge[] = edgeRows.map((r) => ({
      source: r.source,
      target: r.target,
    }));

    return { nodes, edges };
  }

  // ── Chat sessions / messages ──────────────────────────────────

  /** Insert a new chat session. Title is typically null until the first user message. */
  createSession(opts: { id: string; title: string | null; pagePath: string | null }): void {
    const db = this.requireOpen();
    const now = Date.now();
    db.prepare(
      'INSERT INTO chat_sessions (id, title, page_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(opts.id, opts.title, opts.pagePath, now, now);
  }

  /** Update a session's title (e.g. from the first user message). */
  updateSessionTitle(sessionId: string, title: string): void {
    const db = this.requireOpen();
    db.prepare(
      'UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?',
    ).run(title.slice(0, 120), Date.now(), sessionId);
  }

  /** Update a session's pagePath binding (or unbind by passing null). */
  updateSessionPagePath(sessionId: string, pagePath: string | null): void {
    const db = this.requireOpen();
    db.prepare(
      'UPDATE chat_sessions SET page_path = ?, updated_at = ? WHERE id = ?',
    ).run(pagePath, Date.now(), sessionId);
  }

  /** Bump updated_at — call when a message is appended/updated. */
  touchSession(sessionId: string): void {
    const db = this.requireOpen();
    db.prepare('UPDATE chat_sessions SET updated_at = ? WHERE id = ?').run(
      Date.now(),
      sessionId,
    );
  }

  /** Delete a session and cascade-clean its messages (and FTS rows). */
  deleteSession(sessionId: string): void {
    const db = this.requireOpen();
    const tx = db.transaction(() => {
      const ids = db.prepare(
        'SELECT id FROM chat_messages WHERE session_id = ?',
      ).all(sessionId) as Array<{ id: string }>;
      const delFts = db.prepare('DELETE FROM chat_messages_fts WHERE message_id = ?');
      for (const r of ids) delFts.run(r.id);
      // chat_messages rows removed by FK cascade when session is deleted.
      db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(sessionId);
    });
    tx();
  }

  /** List sessions, optionally filtered by page_path. Most recent first. */
  listSessions(opts: {
    pagePath?: string | null;
    includeGlobal?: boolean;
    limit?: number;
  } = {}): ChatSession[] {
    const db = this.requireOpen();
    const limit = opts.limit ?? 50;
    const conds: string[] = [];
    const params: unknown[] = [];

    if (opts.pagePath !== undefined) {
      conds.push('(page_path = ? OR page_path IS NULL)');
      params.push(opts.pagePath);
    } else if (opts.includeGlobal === false) {
      conds.push('page_path IS NOT NULL');
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = db.prepare(
      `SELECT id, title, page_path AS pagePath, created_at AS createdAt, updated_at AS updatedAt,
        (SELECT COUNT(*) FROM chat_messages WHERE session_id = chat_sessions.id) AS messageCount
       FROM chat_sessions ${where}
       ORDER BY updated_at DESC
       LIMIT ?`,
    ).all(...params, limit) as Array<{
      id: string;
      title: string | null;
      pagePath: string | null;
      createdAt: number;
      updatedAt: number;
      messageCount: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      pagePath: r.pagePath,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      messageCount: r.messageCount,
    }));
  }

  /** Return a single session row, or null if not found. */
  getSession(id: string): ChatSession | null {
    const db = this.requireOpen();
    const row = db.prepare(
      `SELECT id, title, page_path AS pagePath, created_at AS createdAt, updated_at AS updatedAt,
        (SELECT COUNT(*) FROM chat_messages WHERE session_id = chat_sessions.id) AS messageCount
       FROM chat_sessions WHERE id = ?`,
    ).get(id) as ChatSession | undefined;
    return row ?? null;
  }

  /** Upsert a message into chat_messages + keep FTS in sync (standalone FTS pattern). */
  upsertMessage(sessionId: string, msg: ChatMessage, seq: number): void {
    const db = this.requireOpen();
    const now = Date.now();
    const toolCallsJson = msg.toolCalls ? JSON.stringify(msg.toolCalls) : null;
    const toolResultsJson = msg.toolResults ? JSON.stringify(msg.toolResults) : null;

    const tx = db.transaction(() => {
      const existing = db.prepare(
        'SELECT id FROM chat_messages WHERE id = ?',
      ).get(msg.id) as { id: string } | undefined;

      if (existing) {
        db.prepare('DELETE FROM chat_messages_fts WHERE message_id = ?').run(msg.id);
        db.prepare(
          `UPDATE chat_messages SET role = ?, content = ?, tool_calls_json = ?, tool_results_json = ?, seq = ?, created_at = ? WHERE id = ?`,
        ).run(msg.role, msg.content, toolCallsJson, toolResultsJson, seq, now, msg.id);
      } else {
        db.prepare(
          `INSERT INTO chat_messages (id, session_id, role, content, tool_calls_json, tool_results_json, seq, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(msg.id, sessionId, msg.role, msg.content, toolCallsJson, toolResultsJson, seq, now);
      }
      // Insert fresh FTS row reflecting current content.
      db.prepare('INSERT INTO chat_messages_fts (content, message_id) VALUES (?, ?)').run(
        msg.content,
        msg.id,
      );
      // Touch the parent session so it bubbles to the top of recents.
      db.prepare('UPDATE chat_sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);
    });
    tx();
  }

  /** Delete a single message + its FTS row. */
  deleteMessage(messageId: string): void {
    const db = this.requireOpen();
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM chat_messages_fts WHERE message_id = ?').run(messageId);
      db.prepare('DELETE FROM chat_messages WHERE id = ?').run(messageId);
    });
    tx();
  }

  /** Load all messages of a session, ordered by seq. Re-hydrates toolCalls/toolResults JSON. */
  listMessages(sessionId: string): ChatMessage[] {
    const db = this.requireOpen();
    const rows = db.prepare(
      `SELECT id, role, content, tool_calls_json AS toolCallsJson, tool_results_json AS toolResultsJson
       FROM chat_messages WHERE session_id = ? ORDER BY seq ASC`,
    ).all(sessionId) as Array<{
      id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      toolCallsJson: string | null;
      toolResultsJson: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      toolCalls: r.toolCallsJson ? safeParse(r.toolCallsJson) : undefined,
      toolResults: r.toolResultsJson ? safeParse(r.toolResultsJson) : undefined,
    }));
  }

  /** FTS5 search over chat messages, joined with their parent session. */
  searchMessages(query: string, limit = 20): ChatSearchResult[] {
    const db = this.requireOpen();
    const trimmed = query.trim();
    if (!trimmed) return [];
    const sanitized = trimmed.replace(/"/g, '""');
    try {
      const rows = db.prepare(`
        SELECT
          f.message_id       AS messageId,
          m.session_id       AS sessionId,
          m.role             AS role,
          substring(coalesce(m.content, ''), 1, 200) AS snippet,
          bm25(chat_messages_fts) AS rank,
          s.title            AS sessionTitle,
          s.page_path        AS pagePath
        FROM chat_messages_fts f
        JOIN chat_messages m ON m.id = f.message_id
        JOIN chat_sessions s ON s.id = m.session_id
        WHERE chat_messages_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(sanitized, limit) as Array<{
        messageId: string;
        sessionId: string;
        role: 'user' | 'assistant' | 'system';
        snippet: string;
        rank: number;
        sessionTitle: string | null;
        pagePath: string | null;
      }>;
      return rows.map((r) => ({
        sessionId: r.sessionId,
        sessionTitle: r.sessionTitle,
        pagePath: r.pagePath,
        messageId: r.messageId,
        role: r.role,
        snippet: r.snippet.replace(/\s+/g, ' ').trim(),
        rank: r.rank,
      }));
    } catch {
      return [];
    }
  }

  // ── Page versions ─────────────────────────────────────────────

  /**
   * Insert a snapshot of a page's content. Snapshots are full content (not diffs) —
   * Markdown pages are typically small and this makes restore O(1).
   * `source='pre-restore'` is used when capturing the current state right before
   * overwriting it with a restored version, so the user can undo a restore.
   */
  createVersion(opts: CreateVersionInput): number {
    const db = this.requireOpen();
    const source = opts.source ?? 'manual';
    const label = opts.label ?? null;
    const info = db.prepare(
      `INSERT INTO page_versions (path, content, size, created_at, source, label)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(opts.path, opts.content, opts.content.length, Date.now(), source, label);
    return Number(info.lastInsertRowid);
  }

  /** List version metadata for a page, most recent first. Excludes content. */
  listVersions(pagePath: string): PageVersionMeta[] {
    const db = this.requireOpen();
    const rows = db.prepare(
      `SELECT id, path, size, created_at AS createdAt, source, label
       FROM page_versions
       WHERE path = ?
       ORDER BY created_at DESC`,
    ).all(pagePath) as Array<{
      id: number;
      path: string;
      size: number;
      createdAt: number;
      source: 'manual' | 'pre-restore';
      label: string | null;
    }>;
    return rows;
  }

  /** Load a single version including content, or null if not found. */
  getVersion(id: number): PageVersion | null {
    const db = this.requireOpen();
    const row = db.prepare(
      `SELECT id, path, content, size, created_at AS createdAt, source, label
       FROM page_versions
       WHERE id = ?`,
    ).get(id) as PageVersion | undefined;
    return row ?? null;
  }

  /** Delete a single version snapshot. */
  deleteVersion(id: number): void {
    const db = this.requireOpen();
    db.prepare('DELETE FROM page_versions WHERE id = ?').run(id);
  }

  /** Throws if the DB hasn't been opened. Use inside methods that use `db` in closures. */
  private requireOpen(): DB {
    if (!this.db) throw new Error('DB not open');
    return this.db;
  }
}

export const DatabaseService = new DatabaseServiceClass();

/** Best-effort JSON.parse — returns the parsed value or undefined on failure. */
function safeParse<T>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

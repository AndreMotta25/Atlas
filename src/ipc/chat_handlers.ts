import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import { createChannel } from '../types';
import { DatabaseService } from '../vault/db';
import type { ChatMessage, ChatSearchResult, ChatSession } from '../types';

/**
 * IPC handlers for chat session persistence.
 *
 * Sessions are created on demand (first message of a conversation) and
 * listed/opened/deleted by the renderer. Messages are upserted individually
 * so streaming writes don't require rewriting the whole history.
 */
export const registerChatHandlers = (): void => {
  // Create a new (empty) session. Returns the row.
  ipcMain.handle(
    createChannel('chat', 'create-session'),
    async (_e, opts?: { pagePath?: string | null; title?: string | null }): Promise<ChatSession> => {
      const id = randomUUID();
      const pagePath = opts?.pagePath ?? null;
      const title = opts?.title ?? null;
      DatabaseService.createSession({ id, title, pagePath });
      // Re-read to get timestamps populated. createSession always inserts, so this is non-null.
      const session = DatabaseService.getSession(id);
      if (!session) throw new Error('Failed to create session');
      return session;
    },
  );

  // List sessions — most recent first.
  ipcMain.handle(
    createChannel('chat', 'list-sessions'),
    async (
      _e,
      opts?: { pagePath?: string | null; includeGlobal?: boolean; limit?: number },
    ): Promise<ChatSession[]> => {
      try {
        return DatabaseService.listSessions(opts ?? {});
      } catch {
        return [];
      }
    },
  );

  // Load a session + all its messages.
  ipcMain.handle(
    createChannel('chat', 'load-session'),
    async (
      _e,
      id: string,
    ): Promise<{ session: ChatSession; messages: ChatMessage[] } | null> => {
      if (typeof id !== 'string') return null;
      const session = DatabaseService.getSession(id);
      if (!session) return null;
      try {
        const messages = DatabaseService.listMessages(id);
        return { session, messages };
      } catch {
        return { session, messages: [] };
      }
    },
  );

  // Delete a session (cascade-deletes its messages + FTS rows).
  ipcMain.handle(
    createChannel('chat', 'delete-session'),
    async (_e, id: string): Promise<{ success: boolean }> => {
      if (typeof id !== 'string') return { success: false };
      try {
        DatabaseService.deleteSession(id);
        return { success: true };
      } catch {
        return { success: false };
      }
    },
  );

  // Rename a session.
  ipcMain.handle(
    createChannel('chat', 'rename-session'),
    async (_e, id: string, title: string): Promise<{ success: boolean }> => {
      if (typeof id !== 'string' || typeof title !== 'string') return { success: false };
      try {
        DatabaseService.updateSessionTitle(id, title);
        return { success: true };
      } catch {
        return { success: false };
      }
    },
  );

  // Bind/unbind a session to a page. Pass null as pagePath to unbind.
  ipcMain.handle(
    createChannel('chat', 'update-session-page-path'),
    async (
      _e,
      id: string,
      pagePath: string | null,
    ): Promise<{ success: boolean; session?: ChatSession; error?: string }> => {
      if (typeof id !== 'string') return { success: false, error: 'invalid id' };
      if (pagePath !== null && typeof pagePath !== 'string') {
        return { success: false, error: 'invalid pagePath' };
      }
      try {
        DatabaseService.updateSessionPagePath(id, pagePath);
        const session = DatabaseService.getSession(id);
        return { success: true, session: session ?? undefined };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  // Upsert a message into a session (idempotent by message.id).
  // `seq` is the message's position within the session — the renderer passes
  // its current messages.length as seq when persisting.
  ipcMain.handle(
    createChannel('chat', 'save-message'),
    async (
      _e,
      sessionId: string,
      message: ChatMessage,
      seq: number,
    ): Promise<{ success: boolean }> => {
      if (typeof sessionId !== 'string' || !message || typeof message.id !== 'string') {
        return { success: false };
      }
      try {
        DatabaseService.upsertMessage(sessionId, message, seq);
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) } as {
          success: boolean;
          error?: string;
        };
      }
    },
  );

  // FTS5 search over message content.
  ipcMain.handle(
    createChannel('chat', 'search-messages'),
    async (_e, query: string, limit?: number): Promise<ChatSearchResult[]> => {
      if (typeof query !== 'string') return [];
      try {
        return DatabaseService.searchMessages(query, limit ?? 20);
      } catch {
        return [];
      }
    },
  );
};

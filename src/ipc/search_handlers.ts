import { ipcMain } from 'electron';
import { createChannel } from '../types';
import { DatabaseService } from '../vault/db';
import type { BacklinkResult, SearchResult } from '../types';

export const registerSearchHandlers = (): void => {
  // Content search over the FTS5 index. Instant + free (no LLM call).
  ipcMain.handle(
    createChannel('vault', 'search'),
    async (_e, query: string, limit?: number): Promise<SearchResult[]> => {
      if (typeof query !== 'string') return [];
      try {
        return DatabaseService.search(query, limit ?? 20);
      } catch {
        return [];
      }
    },
  );

  // Pages that link to the given target path.
  ipcMain.handle(
    createChannel('vault', 'backlinks'),
    async (_e, targetPath: string): Promise<BacklinkResult[]> => {
      if (typeof targetPath !== 'string') return [];
      try {
        return DatabaseService.getBacklinks(targetPath);
      } catch {
        return [];
      }
    },
  );
};

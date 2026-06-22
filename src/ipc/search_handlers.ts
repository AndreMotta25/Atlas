import { ipcMain } from 'electron';
import { createChannel } from '../types';
import { DatabaseService } from '../vault/db';
import type { BacklinkResult, GraphData, SearchResult, TagResult, TagPageResult } from '../types';

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

  // List all tags with page counts.
  ipcMain.handle(
    createChannel('vault', 'tags'),
    async (): Promise<TagResult[]> => {
      try {
        return DatabaseService.listTags();
      } catch {
        return [];
      }
    },
  );

  // Pages that contain a given tag.
  ipcMain.handle(
    createChannel('vault', 'pages-by-tag'),
    async (_e, tag: string): Promise<TagPageResult[]> => {
      if (typeof tag !== 'string') return [];
      try {
        return DatabaseService.getPagesByTag(tag);
      } catch {
        return [];
      }
    },
  );

  // Full graph of pages + resolved links (used by the graph view).
  ipcMain.handle(
    createChannel('vault', 'graph'),
    async (): Promise<GraphData> => {
      try {
        return DatabaseService.getGraph();
      } catch {
        return { nodes: [], edges: [] };
      }
    },
  );
};

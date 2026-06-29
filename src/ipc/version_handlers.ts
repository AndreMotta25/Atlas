import { ipcMain } from 'electron';
import { createChannel } from '../types';
import type { CreateVersionInput, RestoreVersionResult } from '../types';
import { DatabaseService } from '../vault/db';
import { VaultManager } from '../vault/manager';

/**
 * IPC handlers for page versioning.
 *
 * Channels (namespace `version`):
 *   - version:create   — store a manual/pre-restore snapshot
 *   - version:list     — metadata for a page, most recent first (no content)
 *   - version:get      — full version including content
 *   - version:restore  — overwrite file with the version's content
 *                          (captures a `pre-restore` snapshot first)
 *   - version:delete   — remove a snapshot
 *
 * Snapshots live in `atlas.db` (page_versions table); the vault filesystem
 * only ever sees the *current* state of a page.
 */
export const registerVersionHandlers = (): void => {
  ipcMain.handle(createChannel('version', 'create'), async (_e, input: CreateVersionInput) => {
    if (!input || typeof input.path !== 'string' || typeof input.content !== 'string') {
      return { success: false, error: 'Invalid input' };
    }
    const id = DatabaseService.createVersion({
      path: input.path,
      content: input.content,
      label: input.label ?? null,
      source: input.source ?? 'manual',
    });
    return { success: true, id };
  });

  ipcMain.handle(createChannel('version', 'list'), async (_e, path: string) => {
    if (typeof path !== 'string') return [];
    return DatabaseService.listVersions(path);
  });

  ipcMain.handle(createChannel('version', 'get'), async (_e, id: number) => {
    if (typeof id !== 'number') return null;
    return DatabaseService.getVersion(id);
  });

  ipcMain.handle(
    createChannel('version', 'restore'),
    async (_e, id: number): Promise<RestoreVersionResult> => {
      if (typeof id !== 'number') {
        return { success: false, error: 'Invalid id' };
      }
      try {
        const target = DatabaseService.getVersion(id);
        if (!target) {
          return { success: false, error: 'Version not found' };
        }
        if (!VaultManager.isConfigured()) {
          return { success: false, error: 'Vault not configured' };
        }

        // Capture current file state as `pre-restore` BEFORE overwriting.
        // If the file doesn't exist anymore (was deleted), skip the snapshot.
        try {
          const current = await VaultManager.readPage(target.path);
          DatabaseService.createVersion({
            path: target.path,
            content: current.content,
            source: 'pre-restore',
            label: 'Antes de restaurar',
          });
        } catch {
          // File missing — nothing to snapshot, proceed with restore.
        }

        await VaultManager.writePage(target.path, target.content);
        return { success: true, path: target.path, content: target.content };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    },
  );

  ipcMain.handle(createChannel('version', 'delete'), async (_e, id: number) => {
    if (typeof id !== 'number') return { success: false, error: 'Invalid id' };
    DatabaseService.deleteVersion(id);
    return { success: true };
  });
};

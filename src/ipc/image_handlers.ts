import { ipcMain, net } from 'electron';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { createChannel } from '../types';
import type { ImageImportResult, ImageSaveBufferPayload } from '../types';
import { VaultManager } from '../vault/manager';

const ATTACHMENTS_DIR = 'anexos';
const ALLOWED_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);

/** Map a MIME type to a file extension. Falls back to 'png'. */
function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/avif': 'avif',
  };
  return map[mime.split(';')[0].trim().toLowerCase()] ?? 'png';
}

/** Random short id (6 hex chars). */
function shortId(): string {
  return Math.random().toString(16).slice(2, 8);
}

/** Sanitize a filename into an allowed extension + unique name under anexos/. */
function uniqueName(ext: string): string {
  const cleanExt = ext.toLowerCase().replace(/^\.+/, '');
  const safeExt = ALLOWED_EXTS.has(cleanExt) ? cleanExt : 'png';
  return `${Date.now()}-${shortId()}.${safeExt}`;
}

export const registerImageHandlers = (): void => {
  // Save a base64-encoded buffer (used by clipboard paste).
  ipcMain.handle(
    createChannel('image', 'save-buffer'),
    async (_event, payload: ImageSaveBufferPayload): Promise<ImageImportResult> => {
      if (!payload || typeof payload.base64 !== 'string' || typeof payload.ext !== 'string') {
        return { success: false, error: 'Invalid payload' };
      }
      try {
        const name = uniqueName(payload.ext);
        const relPath = path.posix.join(ATTACHMENTS_DIR, name);
        const buf = Buffer.from(payload.base64, 'base64');
        await VaultManager.writeFile(relPath, buf);
        return { success: true, relPath };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  // Import a file from an absolute path on disk (drag-and-drop from Explorer).
  ipcMain.handle(
    createChannel('image', 'import-from-path'),
    async (_event, absPath: string): Promise<ImageImportResult> => {
      if (typeof absPath !== 'string' || !absPath) {
        return { success: false, error: 'Invalid path' };
      }
      try {
        const ext = path.extname(absPath).slice(1);
        if (!ALLOWED_EXTS.has(ext.toLowerCase())) {
          return { success: false, error: `Unsupported extension: ${ext}` };
        }
        const name = uniqueName(ext);
        const relPath = path.posix.join(ATTACHMENTS_DIR, name);
        const buf = await fsp.readFile(absPath);
        await VaultManager.writeFile(relPath, buf);
        return { success: true, relPath };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  // Download an image from a URL (drag from web browser or pasted image URL).
  ipcMain.handle(
    createChannel('image', 'download-from-url'),
    async (_event, url: string): Promise<ImageImportResult> => {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        return { success: false, error: 'Invalid URL' };
      }
      try {
        const res = await net.fetch(url);
        if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
        const mime = res.headers.get('content-type') ?? 'image/png';
        const buf = Buffer.from(await res.arrayBuffer());
        const ext = extFromMime(mime);
        const name = uniqueName(ext);
        const relPath = path.posix.join(ATTACHMENTS_DIR, name);
        await VaultManager.writeFile(relPath, buf);
        return { success: true, relPath };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  console.log('[ipc] registering handlers: image:save-buffer, image:import-from-path, image:download-from-url');
};

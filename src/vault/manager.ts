import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { createChannel } from '../types';
import type { VaultChangeEvent, VaultTree } from '../types';

const IGNORED = new Set(['.git', '.obsidian', '.DS_Store', 'node_modules']);

class VaultManagerClass {
  private root: string | null = null;
  private watcher: FSWatcher | null = null;

  setRoot(absPath: string): void {
    this.stopWatch();
    this.root = absPath;
    this.startWatch();
  }

  getRoot(): string | null {
    return this.root;
  }

  isConfigured(): boolean {
    return this.root !== null;
  }

  private isHidden(baseName: string): boolean {
    return baseName.startsWith('.') || IGNORED.has(baseName);
  }

  async readTree(): Promise<VaultTree> {
    if (!this.root) {
      throw new Error('Vault not configured');
    }
    return this.walk(this.root, '');
  }

  private async walk(absRoot: string, relDir: string): Promise<VaultTree> {
    const absDir = relDir ? path.join(absRoot, relDir) : absRoot;
    const entries = await fsp.readdir(absDir, { withFileTypes: true });
    const children: VaultTree[] = [];

    for (const entry of entries) {
      if (this.isHidden(entry.name)) continue;

      const relPath = relDir ? path.posix.join(relDir, entry.name) : entry.name;

      if (entry.isDirectory()) {
        children.push(await this.walk(absRoot, relPath));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        children.push({ path: relPath, name: entry.name, isDir: false });
      }
    }

    children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });

    const nodeName = relDir ? path.basename(relDir) : path.basename(absRoot);
    return {
      path: relDir,
      name: nodeName,
      isDir: true,
      children,
    };
  }

  /** Resolve relPath against root, blocking path traversal escapes. */
  private resolve(relPath: string): string {
    if (!this.root) throw new Error('Vault not configured');
    const cleaned = path.normalize(relPath).replace(/^([/\\]\.\.[/\\]?)+/, '');
    const abs = path.resolve(this.root, cleaned);
    if (abs !== this.root && !abs.startsWith(this.root + path.sep)) {
      throw new Error('Path traversal blocked');
    }
    return abs;
  }

  async readPage(relPath: string): Promise<{ path: string; content: string; mtime: number }> {
    const abs = this.resolve(relPath);
    const stat = await fsp.stat(abs);
    const content = await fsp.readFile(abs, 'utf-8');
    return { path: relPath, content, mtime: stat.mtimeMs };
  }

  async writePage(relPath: string, content: string): Promise<void> {
    const abs = this.resolve(relPath);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, content, 'utf-8');
  }

  async createFolder(relPath: string): Promise<void> {
    const abs = this.resolve(relPath);
    await fsp.mkdir(abs, { recursive: true });
  }

  async movePage(fromRelPath: string, toRelPath: string): Promise<void> {
    const absFrom = this.resolve(fromRelPath);
    const absTo = this.resolve(toRelPath);
    await fsp.mkdir(path.dirname(absTo), { recursive: true });
    await fsp.rename(absFrom, absTo);
  }

  async rename(oldRelPath: string, newRelPath: string): Promise<void> {
    await this.movePage(oldRelPath, newRelPath);
  }

  private startWatch(): void {
    if (!this.root) return;
    // eslint-disable-next-line import/no-named-as-default-member
    this.watcher = chokidar.watch(this.root, {
      ignoreInitial: true,
      ignored: (p: string) => {
        const rel = path.relative(this.root as string, p);
        if (!rel) return false;
        return rel.split(path.sep).some((seg) => this.isHidden(seg));
      },
      awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    });

    const emit = (type: VaultChangeEvent['type']) => (filePath: string) => {
      if (!this.root) return;
      const rel = path.relative(this.root, filePath).split(path.sep).join('/');
      if (!rel) return;
      const payload: VaultChangeEvent = { type, path: rel };
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(createChannel('vault', 'changed'), payload);
      }
    };

    this.watcher
      .on('add', emit('add'))
      .on('change', emit('change'))
      .on('unlink', emit('unlink'))
      .on('addDir', emit('addDir'))
      .on('unlinkDir', emit('unlinkDir'));
  }

  stopWatch(): void {
    if (this.watcher) {
      void this.watcher.close();
      this.watcher = null;
    }
  }
}

export const VaultManager = new VaultManagerClass();

/** Initialize VaultManager from persisted config at startup. */
export const initVaultFromConfig = (vaultPath: string | null): void => {
  if (vaultPath && fs.existsSync(vaultPath)) {
    VaultManager.setRoot(vaultPath);
  }
};

import { randomUUID } from 'crypto';
import * as fsp from 'fs/promises';
import { VaultManager } from '../vault/manager';
import type { EditPageMode, ToolResultPayload, UndoSnapshot } from '../types';

const MAX_UNDO = 10;

interface EditArgs {
  path: string;
  mode: EditPageMode;
  content: string;
  section?: string;
}

interface CreateArgs {
  path: string;
  content: string;
}

class ToolExecutorClass {
  private undoStack: UndoSnapshot[] = [];

  /** Read prior content of a page (or null if it doesn't exist). Used to build undo snapshots. */
  private async readPrior(relPath: string): Promise<string | null> {
    try {
      const result = await VaultManager.readPage(relPath);
      return result.content;
    } catch {
      return null;
    }
  }

  private async snapshot(relPath: string, toolName: string): Promise<UndoSnapshot> {
    const oldContent = await this.readPrior(relPath);
    const snap: UndoSnapshot = {
      id: randomUUID(),
      path: relPath,
      oldContent,
      timestamp: Date.now(),
      toolName,
    };
    this.undoStack.push(snap);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    return snap;
  }

  async createPage(args: CreateArgs): Promise<ToolResultPayload> {
    const prior = await this.readPrior(args.path);
    if (prior !== null) {
      return {
        toolCallId: '',
        toolName: 'create_page',
        success: false,
        path: args.path,
        error: `Página "${args.path}" já existe.`,
      };
    }
    await this.snapshot(args.path, 'create_page');
    try {
      await VaultManager.writePage(args.path, args.content);
      return {
        toolCallId: '',
        toolName: 'create_page',
        success: true,
        path: args.path,
        newContent: args.content,
      };
    } catch (err) {
      return {
        toolCallId: '',
        toolName: 'create_page',
        success: false,
        path: args.path,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async editPage(args: EditArgs): Promise<ToolResultPayload> {
    const prior = await this.readPrior(args.path);
    if (prior === null) {
      return {
        toolCallId: '',
        toolName: 'edit_page',
        success: false,
        path: args.path,
        error: `Página "${args.path}" não encontrada.`,
      };
    }
    await this.snapshot(args.path, 'edit_page');

    let newContent: string;
    try {
      switch (args.mode) {
        case 'replace':
          newContent = args.content;
          break;
        case 'append':
          newContent = prior.endsWith('\n')
            ? prior + '\n' + args.content
            : prior + '\n\n' + args.content;
          break;
        case 'replace_section':
          if (!args.section) {
            return {
              toolCallId: '',
              toolName: 'edit_page',
              success: false,
              path: args.path,
              error: 'Modo "replace_section" requer o parâmetro "section".',
            };
          }
          newContent = this.sectionReplace(prior, args.section, args.content);
          break;
      }
    } catch (err) {
      return {
        toolCallId: '',
        toolName: 'edit_page',
        success: false,
        path: args.path,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    try {
      await VaultManager.writePage(args.path, newContent);
      return {
        toolCallId: '',
        toolName: 'edit_page',
        success: true,
        path: args.path,
        previousContent: prior,
        newContent,
      };
    } catch (err) {
      return {
        toolCallId: '',
        toolName: 'edit_page',
        success: false,
        path: args.path,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Replace a section identified by heading text.
   * - Find heading `^#{1,6}\s+sectionName\s*$` (case-insensitive).
   * - If not found: append `## sectionName\nnewContent` at the end.
   * - Else: preserve original heading line + level, replace everything between
   *   the heading and the next heading of same-or-higher level (or EOF).
   */
  sectionReplace(content: string, sectionName: string, newBody: string): string {
    const lines = content.split('\n');
    const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headingRe = new RegExp(`^(#{1,6})\\s+${escaped}\\s*$`, 'i');

    const headingIdx = lines.findIndex((l) => headingRe.test(l));
    if (headingIdx === -1) {
      // Section does not exist — append as a new ## section.
      const sep = content.length > 0 && !content.endsWith('\n') ? '\n\n' : '\n';
      return content + sep + `## ${sectionName}\n` + newBody;
    }

    const headingLine = lines[headingIdx];
    const headingMatch = headingLine.match(/^(#{1,6})/);
    if (!headingMatch) {
      // Should not happen (headingIdx is valid), but be defensive.
      return content;
    }
    const level = headingMatch[1].length;
    const boundaryRe = new RegExp(`^#{1,${level}}\\s`);

    let endIdx = lines.length;
    for (let i = headingIdx + 1; i < lines.length; i++) {
      if (boundaryRe.test(lines[i])) {
        endIdx = i;
        break;
      }
    }

    const bodyLines = newBody.split('\n');
    const next = [
      ...lines.slice(0, headingIdx),
      headingLine,
      ...bodyLines,
      ...lines.slice(endIdx),
    ];
    return next.join('\n');
  }

  async undoLast(): Promise<{ success: boolean; restoredPath?: string; error?: string }> {
    const snap = this.undoStack.pop();
    if (!snap) return { success: false, error: 'Nada para desfazer.' };
    try {
      if (snap.oldContent === null) {
        // File didn't exist before — delete it.
        await this.deletePage(snap.path);
      } else {
        await VaultManager.writePage(snap.path, snap.oldContent);
      }
      return { success: true, restoredPath: snap.path };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async deletePage(relPath: string): Promise<void> {
    // VaultManager has no delete API — go through root resolution + fs.
    // We deliberately do not expose this publicly to avoid misuse.
    const root = VaultManager.getRoot();
    if (!root) throw new Error('Vault not configured');
    const abs = `${root}/${relPath}`.replace(/\\/g, '/');
    await fsp.unlink(abs).catch((e) => {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    });
  }
}

export const ToolExecutor = new ToolExecutorClass();

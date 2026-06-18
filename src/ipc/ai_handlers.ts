import { ipcMain, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { createChannel } from '../types';
import { AIOrchestrator } from '../ai/orchestrator';
import type { ChatRequestOptions, ChatStreamChunk } from '../types';

const activeControllers = new Map<string, AbortController>();

export const registerAIHandlers = (): void => {
  ipcMain.handle(
    createChannel('ai', 'chat'),
    async (event, opts: ChatRequestOptions) => {
      const requestId = randomUUID();
      const sender = event.sender;

      const sink = (chunk: ChatStreamChunk) => {
        if (!sender.isDestroyed()) {
          sender.send(createChannel('ai', 'token'), chunk);
        }
      };

      const controller = new AbortController();
      activeControllers.set(requestId, controller);

      // Fire and forget — streaming happens via sink.
      void AIOrchestrator.streamChat(opts, requestId, sink).finally(() => {
        activeControllers.delete(requestId);
      });

      return { requestId };
    },
  );

  ipcMain.handle(createChannel('ai', 'cancel'), async (_e, requestId: string) => {
    const controller = activeControllers.get(requestId);
    if (controller) {
      controller.abort();
      activeControllers.delete(requestId);
    }
    // Notify renderer the stream ended.
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(createChannel('ai', 'token'), {
        requestId,
        delta: '',
        done: true,
      } satisfies ChatStreamChunk);
    }
    return { success: true };
  });
};

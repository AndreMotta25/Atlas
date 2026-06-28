import { ipcMain, clipboard } from 'electron';
import { createChannel } from '../types';

export const registerClipboardHandlers = (): void => {
  const channel = createChannel('clipboard', 'write');
  console.log('[ipc] registering handler:', channel);
  ipcMain.handle(channel, async (_event, text: string) => {
    if (typeof text !== 'string') {
      return { success: false, error: 'Expected string payload' };
    }
    try {
      clipboard.writeText(text);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
};

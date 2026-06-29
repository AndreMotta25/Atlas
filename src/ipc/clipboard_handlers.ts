import { ipcMain, clipboard } from 'electron';
import { createChannel } from '../types';

export const registerClipboardHandlers = (): void => {
  const writeChannel = createChannel('clipboard', 'write');
  console.log('[ipc] registering handler:', writeChannel);
  ipcMain.handle(writeChannel, async (_event, text: string) => {
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

  const readChannel = createChannel('clipboard', 'read');
  console.log('[ipc] registering handler:', readChannel);
  ipcMain.handle(readChannel, async () => {
    try {
      return { success: true, value: clipboard.readText() };
    } catch (err) {
      return { success: false, value: '', error: err instanceof Error ? err.message : String(err) };
    }
  });
};

import { ipcMain, dialog } from 'electron';
import { createChannel } from '../types';

export const registerFileHandlers = (): void => {
  ipcMain.handle(createChannel('file', 'open-dialog'), async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'] });
    return result;
  });

  ipcMain.handle(createChannel('file', 'save'), async (_event, content: string, defaultName?: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: 'All Files', extensions: ['*'] }],
    });
    if (!result.canceled && result.filePath) {
      const fs = await import('fs');
      fs.writeFileSync(result.filePath, content, 'utf-8');
      return { success: true, filePath: result.filePath };
    }
    return { success: false };
  });
};

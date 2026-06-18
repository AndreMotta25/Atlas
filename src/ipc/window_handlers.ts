import { ipcMain, BrowserWindow } from 'electron';
import { createChannel } from '../types';

export const registerWindowHandlers = (): void => {
  ipcMain.handle(createChannel('window', 'minimize'), () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
    return { success: true };
  });

  ipcMain.handle(createChannel('window', 'maximize'), () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
    return { success: true };
  });

  ipcMain.handle(createChannel('window', 'close'), () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
    return { success: true };
  });
};

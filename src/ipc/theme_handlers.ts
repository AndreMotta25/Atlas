import { ipcMain, nativeTheme } from 'electron';
import { createChannel } from '../types';

export const registerThemeHandlers = (): void => {
  ipcMain.handle(createChannel('theme', 'get-source'), () => {
    return nativeTheme.themeSource;
  });

  ipcMain.handle(createChannel('theme', 'set-source'), (_event, source: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = source;
    return { success: true };
  });

  ipcMain.handle(createChannel('theme', 'should-use-dark-colors'), () => {
    return nativeTheme.shouldUseDarkColors;
  });
};

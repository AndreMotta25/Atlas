import { ipcMain, nativeTheme } from 'electron';
import { z } from 'zod';
import { createChannel } from '../types';

const ThemeSourceSchema = z.enum(['system', 'light', 'dark']);

export const registerThemeHandlers = (): void => {
  ipcMain.handle(createChannel('theme', 'get-source'), () => {
    return nativeTheme.themeSource;
  });

  ipcMain.handle(createChannel('theme', 'set-source'), async (_e, raw: unknown) => {
    const parsed = ThemeSourceSchema.parse(raw);
    nativeTheme.themeSource = parsed;
    return { success: true, shouldUseDarkColors: nativeTheme.shouldUseDarkColors };
  });

  ipcMain.handle(createChannel('theme', 'should-use-dark-colors'), () => {
    return nativeTheme.shouldUseDarkColors;
  });

};

import { ipcMain, app } from 'electron';
import { createChannel } from '../types';

export const registerAppHandlers = (): void => {
  ipcMain.handle(createChannel('app', 'get-version'), () => {
    return app.getVersion();
  });

  ipcMain.handle(createChannel('app', 'get-name'), () => {
    return app.getName();
  });

  ipcMain.handle(createChannel('app', 'get-path'), (_event, name: string) => {
    return app.getPath(name as Parameters<typeof app.getPath>[0]);
  });
};

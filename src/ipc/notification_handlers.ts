import { ipcMain, Notification } from 'electron';
import { createChannel } from '../types';

export const registerNotificationHandlers = (): void => {
  ipcMain.handle(createChannel('notification', 'show'), async (_event, title: string, body: string) => {
    const notification = new Notification({ title, body });
    notification.show();
    return { success: true };
  });
};

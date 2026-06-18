import { ipcMain, shell } from 'electron';
import { createChannel } from '../types';

const ALLOWED_PROTOCOLS = ['https:', 'http:', 'mailto:'];
const BLOCKED_DOMAINS = ['localhost', '127.0.0.1', '0.0.0.0'];

const isSafeUrl = (url: string): { safe: boolean; reason?: string } => {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return { safe: false, reason: `Protocol ${parsed.protocol} not allowed` };
    }
    if (BLOCKED_DOMAINS.includes(parsed.hostname)) {
      return { safe: false, reason: `Domain ${parsed.hostname} is blocked` };
    }
    return { safe: true };
  } catch {
    return { safe: false, reason: 'Invalid URL' };
  }
};

export const registerShellHandlers = (): void => {
  ipcMain.handle(createChannel('shell', 'open-external'), async (_event, url: string) => {
    const check = isSafeUrl(url);
    if (!check.safe) {
      return { success: false, error: check.reason };
    }
    await shell.openExternal(url);
    return { success: true };
  });
};

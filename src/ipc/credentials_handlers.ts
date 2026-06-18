import { ipcMain } from 'electron';
import { createChannel } from '../types';
import { SecureStore } from '../vault/secure_store';
import type { AIProvider } from '../types';

/**
 * Legacy credential handlers. Kept for backwards compatibility with any code
 * that still calls `credentials:store` / `credentials:retrieve`. New code
 * should use `settings:set-api-key` / `settings:has-api-key` /
 * `settings:delete-api-key` instead.
 */
export const registerCredentialHandlers = (): void => {
  ipcMain.handle(createChannel('credentials', 'store'), async (_event, key: string, value: string) => {
    if (!SecureStore.isAvailable()) {
      return { success: false, error: 'Encryption not available' };
    }
    try {
      SecureStore.setApiKey(key as AIProvider, value);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(createChannel('credentials', 'retrieve'), async () => {
    return { success: false, error: 'Use settings:get-api-key instead' };
  });
};

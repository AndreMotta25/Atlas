import { ipcMain } from 'electron';
import { createChannel } from '../types';
import { ConfigStore } from '../vault/config_store';
import { SecureStore } from '../vault/secure_store';
import type { AIProvider, AppSettings } from '../types';

export const registerSettingsHandlers = (): void => {
  ipcMain.handle(createChannel('settings', 'get'), async () => ConfigStore.load());

  ipcMain.handle(createChannel('settings', 'set'), async (_e, patch: Partial<AppSettings>) => {
    return ConfigStore.update(patch);
  });

  ipcMain.handle(
    createChannel('settings', 'set-api-key'),
    async (_e, provider: AIProvider, key: string) => {
      if (!SecureStore.isAvailable()) {
        return { success: false, error: 'Encryption not available' };
      }
      try {
        SecureStore.setApiKey(provider, key);
        return { success: true };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    },
  );

  ipcMain.handle(createChannel('settings', 'has-api-key'), async (_e, provider: AIProvider) => {
    return SecureStore.hasApiKey(provider);
  });

  ipcMain.handle(createChannel('settings', 'get-api-key'), async (_e, provider: AIProvider) => {
    // Note: returning the plaintext key to renderer is acceptable in this app's
    // threat model because the renderer is local and trusted. If you want to
    // avoid exposing it, only use `has-api-key` and pass key usage through main.
    return { value: SecureStore.getApiKey(provider) };
  });

  ipcMain.handle(createChannel('settings', 'delete-api-key'), async (_e, provider: AIProvider) => {
    SecureStore.deleteApiKey(provider);
    return { success: true };
  });
};

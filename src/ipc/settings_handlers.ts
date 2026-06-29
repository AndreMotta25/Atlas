import { ipcMain } from 'electron';
import { createChannel } from '../types';
import { ConfigStore } from '../vault/config_store';
import { SecureStore } from '../vault/secure_store';
import { DEFAULT_SYSTEM_PROMPT } from '../ai/orchestrator';
import type { AIProvider, AppSettings } from '../types';

/**
 * OpenAI-compatible /models endpoints per provider.
 * Only providers that implement this listing API should appear here.
 */
const MODELS_ENDPOINTS: Partial<Record<AIProvider, string>> = {
  deepseek: 'https://api.deepseek.com/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
};

export const registerSettingsHandlers = (): void => {
  ipcMain.handle(createChannel('settings', 'get'), async () => ConfigStore.load());

  ipcMain.handle(createChannel('settings', 'set'), async (_e, patch: Partial<AppSettings>) => {
    return ConfigStore.update(patch);
  });

  ipcMain.handle(createChannel('settings', 'get-default-prompt'), async () => {
    return DEFAULT_SYSTEM_PROMPT;
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

  ipcMain.handle(createChannel('settings', 'list-models'), async (_e, provider: AIProvider) => {
    const url = MODELS_ENDPOINTS[provider];
    if (!url) {
      return { models: [] as string[], error: `Listagem de modelos não suportada para "${provider}".` };
    }
    const key = SecureStore.getApiKey(provider);
    if (!key) {
      return { models: [] as string[], error: 'Nenhuma API key configurada para este provider.' };
    }
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        return { models: [], error: `HTTP ${res.status} ${res.statusText}` };
      }
      const json = (await res.json()) as { data?: Array<{ id: string }> };
      const models = Array.isArray(json.data) ? json.data.map((m) => m.id).filter(Boolean) : [];
      return { models };
    } catch (err) {
      return { models: [], error: (err as Error).message };
    }
  });
};

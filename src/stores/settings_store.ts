import { create } from 'zustand';
import { api } from '../lib/api';
import type { AIProvider, AppSettings } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  vaultPath: null,
  activeProvider: 'deepseek',
  defaultModel: 'deepseek-chat',
  themeMode: 'system',
};

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  setApiKey: (provider: AIProvider, key: string) => Promise<boolean>;
  hasApiKey: (provider: AIProvider) => Promise<boolean>;
  deleteApiKey: (provider: AIProvider) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    const settings = await api.settings.get();
    set({ settings, loaded: true });
  },

  update: async (patch) => {
    const next = await api.settings.set(patch);
    set({ settings: next });
  },

  setApiKey: async (provider, key) => {
    const res = await api.settings.setApiKey(provider, key);
    return res.success;
  },

  hasApiKey: async (provider) => {
    return api.settings.hasApiKey(provider);
  },

  deleteApiKey: async (provider) => {
    await api.settings.deleteApiKey(provider);
    void get();
  },
}));

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { AppSettings } from '../types';

const DEFAULTS: AppSettings = {
  vaultPath: null,
  activeProvider: 'deepseek',
  defaultModel: 'deepseek-chat',
  themeMode: 'system',
};

const FILENAME = 'config.json';

const configPath = (): string => path.join(app.getPath('userData'), FILENAME);

export const ConfigStore = {
  load(): AppSettings {
    try {
      const raw = fs.readFileSync(configPath(), 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return { ...DEFAULTS, ...parsed };
    } catch {
      return { ...DEFAULTS };
    }
  },

  save(settings: AppSettings): void {
    fs.writeFileSync(configPath(), JSON.stringify(settings, null, 2), 'utf-8');
  },

  update(patch: Partial<AppSettings>): AppSettings {
    const merged = { ...this.load(), ...patch };
    this.save(merged);
    return merged;
  },
};

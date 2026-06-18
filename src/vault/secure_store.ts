import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { AIProvider } from '../types';

const FILENAME = 'secrets.json';

const secretsPath = (): string => path.join(app.getPath('userData'), FILENAME);

type SecretMap = Partial<Record<AIProvider, string>>; // base64 ciphertext

const readAll = (): SecretMap => {
  try {
    const raw = fs.readFileSync(secretsPath(), 'utf-8');
    return JSON.parse(raw) as SecretMap;
  } catch {
    return {};
  }
};

const writeAll = (data: SecretMap): void => {
  fs.writeFileSync(secretsPath(), JSON.stringify(data, null, 2), 'utf-8');
};

export const SecureStore = {
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  },

  setApiKey(provider: AIProvider, key: string): void {
    if (!this.isAvailable()) {
      throw new Error('Encryption not available on this system');
    }
    const all = readAll();
    all[provider] = safeStorage.encryptString(key).toString('base64');
    writeAll(all);
  },

  getApiKey(provider: AIProvider): string | null {
    if (!this.isAvailable()) return null;
    const stored = readAll()[provider];
    if (!stored) return null;
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    } catch {
      return null;
    }
  },

  hasApiKey(provider: AIProvider): boolean {
    return readAll()[provider] !== undefined;
  },

  deleteApiKey(provider: AIProvider): void {
    const all = readAll();
    delete all[provider];
    writeAll(all);
  },
};

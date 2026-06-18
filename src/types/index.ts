// ─── IPC Channel Types ───────────────────────────────────────────
export interface IPCChannel {
  namespace: string;
  action: string;
}

export const createChannel = (namespace: string, action: string): string =>
  `${namespace}:${action}`;

// ─── Application Types ──────────────────────────────────────────
export interface AppConfig {
  version: string;
  platform: string;
}

// ─── File Types ─────────────────────────────────────────────────
export interface FileResult {
  success: boolean;
  filePath?: string;
  content?: string;
  error?: string;
}

// ─── Theme Types ────────────────────────────────────────────────
export type ThemeMode = 'system' | 'light' | 'dark';

// ─── Notification Types ─────────────────────────────────────────
export interface NotificationPayload {
  title: string;
  body: string;
}

// ─── Window Types ───────────────────────────────────────────────
export interface WindowState {
  isMaximized: boolean;
  isMinimized: boolean;
  isFocused: boolean;
}

// ─── Credential Types (legado — substituído por SecureStore) ─────
export interface CredentialPayload {
  service: string;
  key: string;
  value: string;
}

export interface CredentialResult {
  success: boolean;
  value?: string;
  error?: string;
}

// ─── Vault Types ────────────────────────────────────────────────
export interface VaultEntry {
  path: string;
  name: string;
  isDir: boolean;
}

export interface VaultTree {
  path: string;
  name: string;
  isDir: boolean;
  children?: VaultTree[];
}

export interface PageContent {
  path: string;
  content: string;
  mtime: number;
}

export type VaultChangeType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';

export interface VaultChangeEvent {
  type: VaultChangeType;
  path: string;
}

export interface VaultStatus {
  configured: boolean;
  root: string | null;
}

// ─── AI Types ───────────────────────────────────────────────────
export type AIProvider = 'deepseek' | 'openai' | 'anthropic' | 'ollama';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequestOptions {
  messages: ChatMessage[];
  model?: string;
}

export interface ChatStreamChunk {
  requestId: string;
  delta: string;
  done: boolean;
  error?: string;
}

export interface ChatStartResult {
  requestId: string;
}

// ─── Settings Types ─────────────────────────────────────────────
export interface AppSettings {
  vaultPath: string | null;
  activeProvider: AIProvider;
  defaultModel: string;
}

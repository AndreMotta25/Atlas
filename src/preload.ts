import { contextBridge, ipcRenderer } from 'electron';
import { createChannel } from './types';
import type {
  AIProvider,
  AppSettings,
  BacklinkResult,
  ChatMessage,
  ChatRequestOptions,
  ChatSearchResult,
  ChatSession,
  ChatStreamChunk,
  PageContent,
  PendingToolCall,
  SearchResult,
  ToolConfirmRequest,
  ToolRejectRequest,
  ToolResultPayload,
  UndoResult,
  VaultChangeEvent,
  VaultStatus,
  VaultTree,
} from './types';

type Listener<T> = (payload: T) => void;
type Unsubscribe = () => void;

const electronAPI = {
  // ── File (legado) ──
  openFileDialog: () => ipcRenderer.invoke(createChannel('file', 'open-dialog')),
  saveFile: (content: string, defaultName?: string) =>
    ipcRenderer.invoke(createChannel('file', 'save'), content, defaultName),

  // ── Shell ──
  openExternal: (url: string) => ipcRenderer.invoke(createChannel('shell', 'open-external'), url),

  // ── Window ──
  minimizeWindow: () => ipcRenderer.invoke(createChannel('window', 'minimize')),
  maximizeWindow: () => ipcRenderer.invoke(createChannel('window', 'maximize')),
  closeWindow: () => ipcRenderer.invoke(createChannel('window', 'close')),

  // ── App ──
  getVersion: () => ipcRenderer.invoke(createChannel('app', 'get-version')),
  getAppName: () => ipcRenderer.invoke(createChannel('app', 'get-name')),
  getPath: (name: string) => ipcRenderer.invoke(createChannel('app', 'get-path'), name),

  // ── Theme ──
  getThemeSource: () => ipcRenderer.invoke(createChannel('theme', 'get-source')),
  setThemeSource: (source: 'system' | 'light' | 'dark') =>
    ipcRenderer.invoke(createChannel('theme', 'set-source'), source),
  shouldUseDarkColors: () => ipcRenderer.invoke(createChannel('theme', 'should-use-dark-colors')),
  onThemeChanged: (listener: Listener<boolean>): Unsubscribe => {
    const channel = createChannel('theme', 'changed');
    const wrapped = (_e: unknown, payload: boolean) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },

  // ── Notification ──
  showNotification: (title: string, body: string) =>
    ipcRenderer.invoke(createChannel('notification', 'show'), title, body),

  // ── Vault ──
  vault: {
    getStatus: (): Promise<VaultStatus> => ipcRenderer.invoke(createChannel('vault', 'get-status')),
    select: (): Promise<VaultStatus> => ipcRenderer.invoke(createChannel('vault', 'select')),
    readTree: (): Promise<VaultTree | null> => ipcRenderer.invoke(createChannel('vault', 'read-tree')),
    readPage: (relPath: string): Promise<PageContent> =>
      ipcRenderer.invoke(createChannel('vault', 'read-page'), relPath),
    writePage: (relPath: string, content: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(createChannel('vault', 'write-page'), relPath, content),
    createFolder: (relPath: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(createChannel('vault', 'create-folder'), relPath),
    movePage: (fromPath: string, toPath: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(createChannel('vault', 'move-page'), fromPath, toPath),
    rename: (oldPath: string, newPath: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(createChannel('vault', 'rename'), oldPath, newPath),
    delete: (relPath: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(createChannel('vault', 'delete'), relPath),
    onChanged: (listener: Listener<VaultChangeEvent>): Unsubscribe => {
      const channel = createChannel('vault', 'changed');
      const wrapped = (_e: unknown, payload: VaultChangeEvent) => listener(payload);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped);
    },
    search: (query: string, limit?: number): Promise<SearchResult[]> =>
      ipcRenderer.invoke(createChannel('vault', 'search'), query, limit),
    backlinks: (targetPath: string): Promise<BacklinkResult[]> =>
      ipcRenderer.invoke(createChannel('vault', 'backlinks'), targetPath),
  },

  // ── Chat sessions (persistence) ──
  chat: {
    createSession: (opts?: {
      pagePath?: string | null;
      title?: string | null;
    }): Promise<ChatSession> =>
      ipcRenderer.invoke(createChannel('chat', 'create-session'), opts),
    listSessions: (opts?: {
      pagePath?: string | null;
      includeGlobal?: boolean;
      limit?: number;
    }): Promise<ChatSession[]> =>
      ipcRenderer.invoke(createChannel('chat', 'list-sessions'), opts),
    loadSession: (id: string): Promise<{ session: ChatSession; messages: ChatMessage[] } | null> =>
      ipcRenderer.invoke(createChannel('chat', 'load-session'), id),
    deleteSession: (id: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(createChannel('chat', 'delete-session'), id),
    renameSession: (id: string, title: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(createChannel('chat', 'rename-session'), id, title),
    saveMessage: (sessionId: string, message: ChatMessage, seq: number): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(createChannel('chat', 'save-message'), sessionId, message, seq),
    searchMessages: (query: string, limit?: number): Promise<ChatSearchResult[]> =>
      ipcRenderer.invoke(createChannel('chat', 'search-messages'), query, limit),
  },

  // ── Settings ──
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(createChannel('settings', 'get')),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(createChannel('settings', 'set'), patch),
    getDefaultPrompt: (): Promise<string> =>
      ipcRenderer.invoke(createChannel('settings', 'get-default-prompt')),
    setApiKey: (provider: AIProvider, key: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(createChannel('settings', 'set-api-key'), provider, key),
    hasApiKey: (provider: AIProvider): Promise<boolean> =>
      ipcRenderer.invoke(createChannel('settings', 'has-api-key'), provider),
    getApiKey: (provider: AIProvider): Promise<{ value: string | null }> =>
      ipcRenderer.invoke(createChannel('settings', 'get-api-key'), provider),
    deleteApiKey: (provider: AIProvider): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(createChannel('settings', 'delete-api-key'), provider),
  },

  // ── AI ──
  ai: {
    chat: (opts: ChatRequestOptions): Promise<{ requestId: string }> =>
      ipcRenderer.invoke(createChannel('ai', 'chat'), opts),
    cancel: (requestId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(createChannel('ai', 'cancel'), requestId),
    compact: (messages: ChatMessage[]): Promise<{ success: boolean; summary?: string; error?: string }> =>
      ipcRenderer.invoke(createChannel('ai', 'compact'), messages),
    search: (query: string, pagePaths: string[]): Promise<{ success: boolean; results?: Array<{ path: string; reason: string }>; error?: string }> =>
      ipcRenderer.invoke(createChannel('ai', 'search'), query, pagePaths),
    onToken: (listener: Listener<ChatStreamChunk>): Unsubscribe => {
      const channel = createChannel('ai', 'token');
      const wrapped = (_e: unknown, payload: ChatStreamChunk) => listener(payload);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped);
    },
    onToolPending: (listener: Listener<PendingToolCall>): Unsubscribe => {
      const channel = createChannel('ai', 'tool-pending');
      const wrapped = (_e: unknown, payload: PendingToolCall) => listener(payload);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped);
    },
    onToolResult: (listener: Listener<ToolResultPayload>): Unsubscribe => {
      const channel = createChannel('ai', 'tool-result');
      const wrapped = (_e: unknown, payload: ToolResultPayload) => listener(payload);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped);
    },
  },

  // ── Tools (write confirmation flow) ──
  tool: {
    confirm: (req: ToolConfirmRequest): Promise<ToolResultPayload> =>
      ipcRenderer.invoke(createChannel('tool', 'confirm'), req),
    reject: (req: ToolRejectRequest): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(createChannel('tool', 'reject'), req),
  },

  // ── Undo ──
  undo: {
    last: (): Promise<UndoResult> => ipcRenderer.invoke(createChannel('undo', 'last')),
  },

  // ── Font loader (bypasses renderer CSP — fetches Google Fonts in main) ──
  font: {
    load: (family: string): Promise<{ success: boolean; css?: string; error?: string }> =>
      ipcRenderer.invoke(createChannel('font', 'load'), family),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;

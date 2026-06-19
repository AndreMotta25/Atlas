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
  /** Tool calls emitted by the assistant in this message (write tools only — read-only ones auto-resolve). */
  toolCalls?: PendingToolCall[];
  /** Tool results attached to this message (from auto-executed read tools or confirmed writes). */
  toolResults?: ToolResultPayload[];
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

// ─── AI Tool Types ──────────────────────────────────────────────
export type ToolKind = 'read_page' | 'list_pages' | 'create_page' | 'edit_page' | 'search' | 'get_backlinks';

export type EditPageMode = 'replace' | 'append' | 'replace_section';

/** A write tool call intercepted mid-stream and waiting for user confirmation. */
export interface PendingToolCall {
  requestId: string;
  toolCallId: string;
  toolName: 'create_page' | 'edit_page';
  args: Record<string, unknown>;
  status: 'pending' | 'applied' | 'rejected' | 'undone';
}

/** Result of executing (or rejecting/undoing) a tool. Sent both for auto-executed reads and confirmed writes. */
export interface ToolResultPayload {
  toolCallId: string;
  toolName: ToolKind;
  success: boolean;
  /** For write tools: path affected. For read_page: path read. */
  path?: string;
  /** For read_page: content; for list_pages: joined paths. */
  content?: string;
  /** For list_pages: number of pages found. */
  count?: number;
  /** For edit_page replace mode: the previous content (used by DiffView in UI). */
  previousContent?: string;
  /** For edit_page: the new content applied. */
  newContent?: string;
  error?: string;
  undone?: boolean;
}

/** Snapshot for undo ring buffer. */
export interface UndoSnapshot {
  id: string;
  path: string;
  /** Prior content; null if the file did not exist before the operation. */
  oldContent: string | null;
  timestamp: number;
  toolName: string;
}

/** Renderer → main: user confirmed a pending write tool call. */
export interface ToolConfirmRequest {
  toolCallId: string;
  toolName: 'create_page' | 'edit_page';
  args: Record<string, unknown>;
  requestId: string;
}

/** Renderer → main: user rejected a pending write tool call. */
export interface ToolRejectRequest {
  toolCallId: string;
  requestId: string;
}

/** In-main context kept per active AI request, used to resume the conversation after tool confirmation. */
export interface ConversationContext {
  requestId: string;
  messages: ChatMessage[];
  model?: string;
  /** Pending write tool calls awaiting confirmation, keyed by toolCallId. */
  pending: Map<string, PendingToolCall>;
}

export interface UndoResult {
  success: boolean;
  restoredPath?: string;
  error?: string;
}

// ─── Settings Types ─────────────────────────────────────────────
export interface AppSettings {
  vaultPath: string | null;
  activeProvider: AIProvider;
  defaultModel: string;
  themeMode: ThemeMode;
  /** Custom system prompt. Falls back to the built-in default when empty or undefined. */
  systemPrompt?: string;
}

// ─── Search / Index Types ───────────────────────────────────────
export interface SearchResult {
  path: string;
  title: string;
  /** Matched snippet (with FTS5 highlight markers stripped). */
  snippet: string;
  /** BM25 rank from FTS5 (lower = more relevant). */
  rank: number;
}

export interface BacklinkResult {
  /** Path of the page that contains the link. */
  fromPath: string;
  fromTitle: string;
  /** The anchor/alias used in the link, if any. */
  anchor: string | null;
}

// ─── Chat Session Types ────────────────────────────────────────
export interface ChatSession {
  id: string;
  title: string | null;
  /** Page path the session is bound to (NULL = global). */
  pagePath: string | null;
  createdAt: number;
  updatedAt: number;
  /** Filled when listing; undefined when only the row is needed. */
  messageCount?: number;
}

export interface ChatSearchResult {
  sessionId: string;
  sessionTitle: string | null;
  pagePath: string | null;
  messageId: string;
  role: 'user' | 'assistant' | 'system';
  /** FTS5 snippet of the matched message content. */
  snippet: string;
  /** BM25 rank (lower = more relevant). */
  rank: number;
}

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
export type AIProvider = 'deepseek' | 'openai' | 'anthropic' | 'ollama' | 'tavily';

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
  /** When set, the AI is told this conversation is bound to a specific page
   *  and should treat it as the primary focus. Injected into the system prompt. */
  pagePath?: string | null;
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
export type ToolKind = 'read_page' | 'list_pages' | 'create_page' | 'edit_page' | 'search' | 'get_backlinks' | 'web_search' | 'web_extract';

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
  /** Page this conversation is bound to — kept so resumed turns (after tool confirmation)
   *  also include the "PÁGINA VINCULADA" block in the system prompt. */
  pagePath?: string | null;
  /** Pending write tool calls awaiting confirmation, keyed by toolCallId. */
  pending: Map<string, PendingToolCall>;
}

export interface UndoResult {
  success: boolean;
  restoredPath?: string;
  error?: string;
}

// ─── Highlight Types ────────────────────────────────────────────
export const HIGHLIGHT_COLORS = [
  { name: 'Amarelo',  value: 'yellow',  light: '#fef08a', dark: '#3b3000', border: '#eab308', borderDark: '#ca8a04' },
  { name: 'Verde',    value: 'green',   light: '#bbf7d0', dark: '#14532d', border: '#4ade80', borderDark: '#22c55e' },
  { name: 'Azul',     value: 'blue',    light: '#bfdbfe', dark: '#1e3a5f', border: '#60a5fa', borderDark: '#3b82f6' },
  { name: 'Vermelho', value: 'red',     light: '#fecaca', dark: '#7f1d1d', border: '#f87171', borderDark: '#ef4444' },
  { name: 'Laranja',  value: 'orange',  light: '#fed7aa', dark: '#7c2d12', border: '#fb923c', borderDark: '#f97316' },
  { name: 'Roxo',     value: 'purple',  light: '#e9d5ff', dark: '#3b0764', border: '#c084fc', borderDark: '#a855f7' },
  { name: 'Ciano',    value: 'cyan',    light: '#a5f3fc', dark: '#164e63', border: '#22d3ee', borderDark: '#06b6d4' },
  { name: 'Cinza',    value: 'gray',    light: '#e2e8f0', dark: '#334155', border: '#94a3b8', borderDark: '#64748b' },
] as const;

export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]['value'];
export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = 'yellow';

// ─── Settings Types ─────────────────────────────────────────────
export interface AppSettings {
  vaultPath: string | null;
  activeProvider: AIProvider;
  defaultModel: string;
  themeMode: ThemeMode;
  /** Custom system prompt. Falls back to the built-in default when empty or undefined. */
  systemPrompt?: string;
  /** Google Font family name applied to the editor + chat. null = system default. */
  fontFamily: string | null;
  /** When true, new chat sessions are automatically bound to the page open in the editor. */
  autoBindChatToPage: boolean;
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

// ─── Tag Types ───────────────────────────────────────────────
export interface TagResult {
  tag: string;
  count: number;
}

export interface TagPageResult {
  path: string;
  title: string;
}

// ─── Graph Types ────────────────────────────────────────────
export interface GraphNode {
  /** pages.id — used as the node identifier by the graph lib. */
  id: number;
  path: string;
  title: string;
  /** Number of links in+out, used to scale the node radius. */
  degree: number;
}

export interface GraphEdge {
  /** pages.id of the page that owns the link. */
  source: number;
  /** pages.id of the referenced page. */
  target: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
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

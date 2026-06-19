import { create } from 'zustand';
import { api } from '../lib/api';
import type {
  ChatMessage,
  ChatSession,
  ChatStreamChunk,
  PendingToolCall,
  ToolResultPayload,
} from '../types';

const newId = () => Math.random().toString(36).slice(2, 10);

/** Best-effort swallower for promise rejections we don't want to surface. */
const noop = (): void => { /* intentional */ };

const WRITE_TOOLS = new Set(['create_page', 'edit_page']);

interface ChatState {
  messages: ChatMessage[];
  streaming: boolean;
  activeRequestId: string | null;
  error: string | null;
  unsubscribe: (() => void) | null;
  /** Pages loaded into Atlas context via right-click → "Enviar para o Atlas". */
  contextPages: string[];
  /** Text snippets sent to Atlas context via editor selection. */
  contextSnippets: string[];
  /** Currently active session — null until first message is sent. */
  activeSession: ChatSession | null;
  /** Recent sessions cache for the dropdown. */
  sessions: ChatSession[];

  init: () => () => void;
  send: (text: string) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
  /** Load a page into chat context without triggering an AI response. */
  loadPageContext: (path: string) => void;
  /** Remove a single page from the context. */
  removePageContext: (path: string) => void;
  /** Add a text snippet to the context. */
  loadSnippetContext: (snippet: string) => void;
  /** Remove a text snippet from the context by index. */
  removeSnippetContext: (index: number) => void;

  // Tool confirmation flow
  confirmToolCall: (toolCallId: string) => Promise<void>;
  rejectToolCall: (toolCallId: string) => Promise<void>;
  undoLast: () => Promise<void>;
  /** Compact the conversation — replaces all messages with an AI-generated summary. */
  compactConversation: () => Promise<void>;

  // Session management
  /** Refresh the recent-sessions cache from disk. */
  refreshSessions: () => Promise<void>;
  /** Create and activate a fresh empty session. */
  newConversation: () => Promise<void>;
  /** Load an existing session by id. */
  loadConversation: (id: string) => Promise<void>;
  /** Delete a session from disk. If it's the active one, clears state. */
  deleteConversation: (id: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streaming: false,
  activeRequestId: null,
  error: null,
  unsubscribe: null,
  contextPages: [],
  contextSnippets: [],
  activeSession: null,
  sessions: [],

  init: () => {
    // Load recent sessions + restore the most recent global one.
    void get().refreshSessions().then(() => {
      const { sessions, activeSession } = get();
      if (activeSession) return;
      const mostRecent = sessions[0];
      if (!mostRecent) return;
      void get().loadConversation(mostRecent.id);
    });

    const offToken = api.ai.onToken((chunk: ChatStreamChunk) => {
      const state = get();
      if (chunk.requestId !== state.activeRequestId) return;

      if (chunk.error) {
        set({ error: chunk.error });
        return;
      }

      if (chunk.delta) {
        set({
          messages: state.messages.map((m) =>
            m.id === state.activeRequestId ? { ...m, content: m.content + chunk.delta } : m,
          ),
        });
      }

      if (chunk.done) {
        // Persist the final assistant message now that the stream closed.
        const after = get();
        const assistantMsg = after.messages.find((m) => m.id === chunk.requestId);
        if (assistantMsg && after.activeSession) {
          const seq = after.messages.findIndex((m) => m.id === chunk.requestId);
          void api.chat.saveMessage(after.activeSession.id, assistantMsg, seq).catch(() => {
            /* persistence is best-effort */
          });
          void get().refreshSessions();
        }
        set({ streaming: false, activeRequestId: null });
      }
    });

    const offPending = api.ai.onToolPending((pending: PendingToolCall) => {
      const state = get();
      if (pending.requestId !== state.activeRequestId) return;
      set({
        messages: state.messages.map((m) =>
          m.id === state.activeRequestId
            ? { ...m, toolCalls: [...(m.toolCalls ?? []), pending] }
            : m,
        ),
      });
    });

    const offResult = api.ai.onToolResult((result: ToolResultPayload) => {
      set((s) => ({
        messages: s.messages.map((m) => {
          if (!m.toolCalls?.some((tc) => tc.toolCallId === result.toolCallId)) {
            // Result for a tool call not in this message? Could be a read tool —
            // attach to the active assistant message as a toolResult entry.
            if (m.id === s.activeRequestId && !WRITE_TOOLS.has(result.toolName)) {
              return {
                ...m,
                toolResults: [...(m.toolResults ?? []), result],
              };
            }
            return m;
          }
          // Update the toolCall status based on result.
          const nextStatus: PendingToolCall['status'] = result.undone
            ? 'undone'
            : result.error
              ? 'rejected'
              : 'applied';
          return {
            ...m,
            toolCalls: m.toolCalls.map((tc) =>
              tc.toolCallId === result.toolCallId ? { ...tc, status: nextStatus } : tc,
            ),
            toolResults: [...(m.toolResults ?? []), result],
          };
        }),
      }));

      // For write tools, the assistant message is finalized after the result is
      // attached — persist the updated version so it survives reload.
      if (WRITE_TOOLS.has(result.toolName)) {
        const after = get();
        if (after.activeSession && after.activeRequestId) {
          const assistantMsg = after.messages.find((m) => m.id === after.activeRequestId);
          if (assistantMsg) {
            const seq = after.messages.findIndex((m) => m.id === after.activeRequestId);
            void api.chat.saveMessage(after.activeSession.id, assistantMsg, seq).catch(noop);
          }
        }
      }
    });

    const unsubscribe = () => {
      offToken();
      offPending();
      offResult();
    };
    set({ unsubscribe });
    return unsubscribe;
  },

  send: async (text) => {
    if (get().streaming) return;
    const { contextPages, contextSnippets } = get();
    // Inject context pages/snippets into the message sent to the AI (not shown in UI).
    const parts: string[] = [];
    if (contextPages.length > 0) parts.push(`Páginas carregadas: ${contextPages.join(', ')}`);
    if (contextSnippets.length > 0) {
      parts.push(`Trechos selecionados:\n${contextSnippets.map((s, i) => `[${i + 1}] ${s}`).join('\n')}`);
    }
    const effectiveText = parts.length > 0
      ? `[${parts.join(' | ')}]\n\n${text}`
      : text;
    const userMsg: ChatMessage = { id: newId(), role: 'user', content: text };
    const assistantId = newId();
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '' };

    // Persist: ensure we have a session. Auto-create on first message.
    let session = get().activeSession;
    try {
      if (!session) {
        session = await api.chat.createSession({ pagePath: null, title: null });
        set({ activeSession: session });
      }
      const seq = get().messages.length;
      await api.chat.saveMessage(session.id, userMsg, seq);
      // Auto-title from first user message.
      if (session.title === null) {
        const title = text.slice(0, 60).replace(/\s+/g, ' ').trim() || 'Sem título';
        await api.chat.renameSession(session.id, title);
        set({
          activeSession: { ...session, title },
        });
      }
    } catch {
      // persistence is best-effort — chat still works in-memory
    }

    set((s) => ({
      messages: [...s.messages, userMsg, assistantMsg],
      streaming: true,
      activeRequestId: assistantId,
      error: null,
    }));

    // Build history using the effective text (with page context) so the AI
    // knows which page the user is referring to.
    const history = get().messages
      .filter((m) => m.id !== assistantId)
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.id === userMsg.id ? effectiveText : m.content,
        toolCalls: m.toolCalls,
        toolResults: m.toolResults,
      }));

    try {
      const { requestId } = await api.ai.chat({ messages: history });
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantId ? { ...m, id: requestId } : m,
        ),
        activeRequestId: requestId,
      }));
    } catch (err) {
      set({
        streaming: false,
        activeRequestId: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  cancel: async () => {
    const { activeRequestId } = get();
    if (!activeRequestId) return;
    await api.ai.cancel(activeRequestId);
    set({ streaming: false, activeRequestId: null });
  },

  reset: () => {
    const { unsubscribe } = get();
    if (unsubscribe) unsubscribe();
    set({
      messages: [],
      streaming: false,
      activeRequestId: null,
      error: null,
      unsubscribe: null,
      contextPages: [],
      contextSnippets: [],
      activeSession: null,
    });
  },

  loadPageContext: (path) =>
    set((s) => ({
      contextPages: s.contextPages.includes(path)
        ? s.contextPages
        : [...s.contextPages, path],
    })),

  removePageContext: (path) =>
    set((s) => ({
      contextPages: s.contextPages.filter((p) => p !== path),
    })),

  loadSnippetContext: (snippet) =>
    set((s) => ({
      contextSnippets: [...s.contextSnippets, snippet],
    })),

  removeSnippetContext: (index) =>
    set((s) => ({
      contextSnippets: s.contextSnippets.filter((_, i) => i !== index),
    })),

  confirmToolCall: async (toolCallId) => {
    const state = get();
    if (!state.activeRequestId) return;
    // Find the pending call to recover toolName + args.
    let pending: PendingToolCall | undefined;
    for (const m of state.messages) {
      pending = m.toolCalls?.find((tc) => tc.toolCallId === toolCallId);
      if (pending) break;
    }
    if (!pending) return;
    try {
      await api.tool.confirm({
        toolCallId: pending.toolCallId,
        toolName: pending.toolName,
        args: pending.args,
        requestId: state.activeRequestId,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  rejectToolCall: async (toolCallId) => {
    const state = get();
    if (!state.activeRequestId) return;
    try {
      await api.tool.reject({
        toolCallId,
        requestId: state.activeRequestId,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  undoLast: async () => {
    try {
      await api.undo.last();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  compactConversation: async () => {
    const state = get();
    if (state.streaming || state.messages.length === 0) return;

    set({ error: null });

    // Show a compacting indicator
    const indicatorId = newId();
    set((s) => ({
      messages: [
        ...s.messages,
        { id: indicatorId, role: 'user' as const, content: '🗜 Compactar conversa' },
        { id: newId(), role: 'assistant' as const, content: '' },
      ],
      streaming: true,
      activeRequestId: indicatorId + '-compact',
    }));

    try {
      const result = await api.ai.compact(state.messages);
      if (result.success && result.summary) {
        // Mark the previous session as "(compactada)" so the original
        // conversation stays accessible in history, and start a fresh
        // session with the summary as the first message.
        const oldSession = get().activeSession;
        if (oldSession) {
          try {
            await api.chat.renameSession(
              oldSession.id,
              `${oldSession.title ?? 'Conversa'} (compactada)`,
            );
          } catch {
            /* best-effort */
          }
        }

        const newSession = await api.chat.createSession({
          pagePath: null,
          title: 'Conversa compactada',
        });
        const summaryContent = `📋 **Conversa compactada**\n\n${result.summary}\n\n---\n*Esta é uma versão resumida da conversa anterior. Você pode continuar fazendo perguntas.*`;
        const summaryMsg: ChatMessage = {
          id: newId(),
          role: 'assistant',
          content: summaryContent,
        };
        try {
          await api.chat.saveMessage(newSession.id, summaryMsg, 0);
        } catch {
          /* best-effort */
        }

        set({
          messages: [summaryMsg],
          streaming: false,
          activeRequestId: null,
          error: null,
          activeSession: newSession,
        });
        void get().refreshSessions();
      } else {
        set({
          streaming: false,
          activeRequestId: null,
          error: result.error ?? 'Falha ao compactar conversa.',
        });
      }
    } catch (err) {
      set({
        streaming: false,
        activeRequestId: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  refreshSessions: async () => {
    try {
      const sessions = await api.chat.listSessions({ includeGlobal: true, limit: 50 });
      set({ sessions });
    } catch {
      /* best-effort */
    }
  },

  newConversation: async () => {
    if (get().streaming) return;
    const session = await api.chat.createSession({ pagePath: null, title: null });
    set({
      activeSession: session,
      messages: [],
      error: null,
      activeRequestId: null,
    });
    void get().refreshSessions();
  },

  loadConversation: async (id) => {
    if (get().streaming) return;
    try {
      const loaded = await api.chat.loadSession(id);
      if (!loaded) return;
      set({
        activeSession: loaded.session,
        messages: loaded.messages,
        error: null,
        activeRequestId: null,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  deleteConversation: async (id) => {
    try {
      await api.chat.deleteSession(id);
      const { activeSession } = get();
      if (activeSession?.id === id) {
        set({ activeSession: null, messages: [] });
      }
      void get().refreshSessions();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },
}));

import { create } from 'zustand';
import { api } from '../lib/api';
import type {
  ChatMessage,
  ChatStreamChunk,
  PendingToolCall,
  ToolResultPayload,
} from '../types';

const newId = () => Math.random().toString(36).slice(2, 10);

const WRITE_TOOLS = new Set(['create_page', 'edit_page']);

interface ChatState {
  messages: ChatMessage[];
  streaming: boolean;
  activeRequestId: string | null;
  error: string | null;
  unsubscribe: (() => void) | null;

  init: () => () => void;
  send: (text: string) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;

  // Tool confirmation flow
  confirmToolCall: (toolCallId: string) => Promise<void>;
  rejectToolCall: (toolCallId: string) => Promise<void>;
  undoLast: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streaming: false,
  activeRequestId: null,
  error: null,
  unsubscribe: null,

  init: () => {
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
    const userMsg: ChatMessage = { id: newId(), role: 'user', content: text };
    const assistantId = newId();
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '' };

    set((s) => ({
      messages: [...s.messages, userMsg, assistantMsg],
      streaming: true,
      activeRequestId: assistantId,
      error: null,
    }));

    const history = get().messages
      .filter((m) => m.id !== assistantId)
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
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
    set({ messages: [], streaming: false, activeRequestId: null, error: null, unsubscribe: null });
  },

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
}));

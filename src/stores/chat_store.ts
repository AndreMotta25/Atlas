import { create } from 'zustand';
import { api } from '../lib/api';
import type { ChatMessage, ChatStreamChunk } from '../types';

const newId = () => Math.random().toString(36).slice(2, 10);

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
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streaming: false,
  activeRequestId: null,
  error: null,
  unsubscribe: null,

  init: () => {
    const off = api.ai.onToken((chunk: ChatStreamChunk) => {
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
    set({ unsubscribe: off });
    return off;
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
      .map((m) => ({ id: m.id, role: m.role, content: m.content }));

    try {
      const { requestId } = await api.ai.chat({ messages: history });
      // Map requestId returned by main to the active assistant message id so
      // incoming token chunks (which reference requestId) update the right msg.
      // We use activeRequestId as the assistantId; main uses its own uuid.
      // To keep matching, we override our activeRequestId to main's requestId
      // AND migrate the in-progress assistant message id to match.
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
}));

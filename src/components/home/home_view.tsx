import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chat_store';
import { useVaultStore } from '../../stores/vault_store';
import { Message } from '../chat/message';
import type { ChatSession, VaultTree } from '../../types';

const SUGGESTIONS = [
  { icon: 'sparkles', label: 'Resuma minhas anotações recentes' },
  { icon: 'doc',      label: 'Crie uma página de ideias' },
  { icon: 'search',   label: 'O que posso fazer com o Atlas?' },
];

/** Flatten the vault tree into a flat list of page paths. */
function flattenPages(node: VaultTree | null): string[] {
  const out: string[] = [];
  const walk = (n: VaultTree) => {
    if (n.isDir) {
      n.children?.forEach(walk);
    } else if (n.path.endsWith('.md')) {
      out.push(n.path);
    }
  };
  if (node) walk(node);
  return out;
}

/** Derive a friendly title from a path (filename without extension). */
function titleFromPath(path: string): string {
  const base = path.split('/').pop() || path;
  return base.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
}

const AtlasLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
    <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
    <path
      d="M24 6 L40 38 H30 L24 24 L18 38 H8 Z"
      fill="currentColor"
      opacity="0.9"
    />
    <circle cx="24" cy="16" r="2.5" fill="var(--background, #fff)" />
  </svg>
);

const SuggestionIcon: React.FC<{ name: string; className?: string }> = ({ name, className }) => {
  if (name === 'doc') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  }
  if (name === 'search') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z" />
    </svg>
  );
};

export const HomeView: React.FC = () => {
  const messages = useChatStore((s) => s.messages);
  const streaming = useChatStore((s) => s.streaming);
  const error = useChatStore((s) => s.error);
  const activeRequestId = useChatStore((s) => s.activeRequestId);
  const sendChat = useChatStore((s) => s.send);
  const cancelChat = useChatStore((s) => s.cancel);
  const sessions = useChatStore((s) => s.sessions);
  const loadConversation = useChatStore((s) => s.loadConversation);
  const newConversation = useChatStore((s) => s.newConversation);

  const openPage = useVaultStore((s) => s.openPage);
  const tree = useVaultStore((s) => s.tree);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const recentPages = useMemo(() => flattenPages(tree).slice(0, 4), [tree]);
  const recentSessions = useMemo(() => sessions.slice(0, 3), [sessions]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    void sendChat(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const hasMessages = messages.length > 0;

  const composer = (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-2xl flex items-end gap-2 p-2 bg-card border border-border rounded-2xl shadow-lg focus-within:border-primary/50 transition-colors"
    >
      <button
        type="button"
        onClick={() => void newConversation()}
        title="Nova conversa"
        aria-label="Nova conversa"
        className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Pergunte qualquer coisa ao Atlas…"
        rows={1}
        className="flex-1 resize-none text-sm bg-transparent text-foreground placeholder:text-muted-foreground/60 focus:outline-none max-h-40"
      />
      {streaming ? (
        <button
          type="button"
          onClick={() => void cancelChat()}
          className="shrink-0 px-3 py-2 bg-destructive/10 text-destructive rounded-xl text-sm font-medium hover:bg-destructive/20 transition-colors"
        >
          Parar
        </button>
      ) : (
        <button
          type="submit"
          disabled={!input.trim()}
          className="shrink-0 w-9 h-9 flex items-center justify-center bg-primary text-primary-foreground rounded-xl hover:brightness-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          title="Enviar"
          aria-label="Enviar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      )}
    </form>
  );

  // ─── Empty state: Notion-AI-style centered hero ──────────────────
  if (!hasMessages) {
    return (
      <div className="flex flex-col h-full bg-background overflow-hidden">
        <div className="flex-1 overflow-auto flex flex-col items-center justify-center px-6 py-10">
          <div className="w-full max-w-2xl flex flex-col items-center animate-scale-in">
            <AtlasLogo className="w-14 h-14 text-primary mb-5" />
            <h1 className="text-2xl font-semibold text-foreground tracking-tight mb-6 text-center">
              Como posso ajudar hoje?
            </h1>

            {/* Centered composer */}
            {composer}

            {/* Suggestions */}
            <div className="mt-6 w-full grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => void sendChat(s.label)}
                  disabled={streaming}
                  className="flex items-center gap-2 text-left text-xs px-3 py-2.5 rounded-xl border border-border bg-card/60 hover:bg-accent hover:border-primary/40 text-foreground transition-colors disabled:opacity-40"
                >
                  <SuggestionIcon name={s.icon} className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="flex-1">{s.label}</span>
                </button>
              ))}
            </div>

            {/* Recent conversations */}
            {recentSessions.length > 0 && (
              <div className="mt-6 w-full">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
                  Conversas recentes
                </p>
                <div className="flex flex-col gap-1">
                  {recentSessions.map((s: ChatSession) => (
                    <button
                      key={s.id}
                      onClick={() => void loadConversation(s.id)}
                      className="flex items-center gap-2 text-left text-sm px-3 py-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span className="truncate flex-1">{s.title ?? 'Sem título'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Recent pages */}
            {recentPages.length > 0 && (
              <div className="mt-4 w-full">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
                  Páginas recentes
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {recentPages.map((p) => (
                    <button
                      key={p}
                      onClick={() => void openPage(p)}
                      className="text-xs px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-accent hover:text-primary text-muted-foreground transition-colors truncate max-w-[200px]"
                      title={p}
                    >
                      {titleFromPath(p)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 w-full text-xs bg-destructive/10 border border-destructive/30 text-destructive rounded px-2 py-1">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Active conversation state ───────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 pt-6 pb-4 space-y-3">
          {messages.map((m, idx) => (
            <Message
              key={m.id}
              message={m}
              streaming={streaming && m.id === activeRequestId}
              isLast={idx === messages.length - 1}
            />
          ))}
          {error && (
            <div className="text-xs bg-destructive/10 border border-destructive/30 text-destructive rounded px-2 py-1">
              {error}
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 flex justify-center px-6 pb-6 pt-2">
        {composer}
      </div>
    </div>
  );
};

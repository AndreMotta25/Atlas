import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chat_store';
import { useVaultStore } from '../../stores/vault_store';
import { Message } from '../chat/message';
import { ThinkingIndicator } from '../thinking_indicator';
import { SendButton } from '../send_button';
import { ThemeToggle } from '../theme_toggle';
import { useSelectionContextMenu } from '../../hooks/use_selection_context_menu';
import { AppIcon } from './app_icon';
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
  const activeSession = useChatStore((s) => s.activeSession);
  const loadConversation = useChatStore((s) => s.loadConversation);
  const newConversation = useChatStore((s) => s.newConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const compactConversation = useChatStore((s) => s.compactConversation);

  const openPage = useVaultStore((s) => s.openPage);
  const tree = useVaultStore((s) => s.tree);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const recentPages = useMemo(() => flattenPages(tree).slice(0, 4), [tree]);
  const recentSessions = useMemo(() => sessions.slice(0, 3), [sessions]);

  // Right-click menu on rendered messages (Copy / Select all) — same as ChatPanel.
  const messagesCtxMenu = useSelectionContextMenu(scrollRef);

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
      className="w-full max-w-2xl flex items-center gap-2 p-2 bg-card border border-border rounded-2xl shadow-lg focus-within:border-primary/50 transition-colors"
    >
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Pergunte qualquer coisa ao Atlas…"
        rows={1}
        className="flex-1 resize-none text-sm px-3 py-2 border border-input bg-background text-foreground rounded-xl focus:outline-none focus:border-primary placeholder:text-muted-foreground/60 max-h-40"
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
        <SendButton disabled={!input.trim()} loading={streaming} />
      )}
    </form>
  );

  // ─── Empty state: Notion-AI-style centered hero ──────────────────
  if (!hasMessages) {
    return (
      <div className="flex flex-col h-full bg-background overflow-hidden">
        <div className="shrink-0 flex items-center justify-end gap-1.5 px-4 py-1.5 border-b border-border bg-muted/30">
          <ThemeToggle variant="compact" />
        </div>
        <div className="flex-1 overflow-auto flex flex-col items-center justify-center px-6 py-10">
          <div className="w-full max-w-2xl flex flex-col items-center animate-scale-in">
            <AppIcon className="w-16 h-16 mb-5" />
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
      {/* Header bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-1.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate max-w-[200px]">
            {activeSession?.title ?? 'Atlas'}
          </span>

          {/* Thinking / Writing indicator */}
          {streaming && (
            <ThinkingIndicator
              hasContent={
                messages.length > 0 &&
                messages[messages.length - 1].role === 'assistant' &&
                !!messages[messages.length - 1].content
              }
            />
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle variant="compact" />
          <div className="w-px h-4 bg-border" />
          <button
            onClick={() => void newConversation()}
            className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Nova conversa"
            aria-label="Nova conversa"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
          {activeSession && !streaming && (
            <button
              onClick={() => {
                if (window.confirm('Tem certeza que deseja apagar esta conversa?')) {
                  void deleteConversation(activeSession.id);
                }
              }}
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-destructive transition-colors"
              title="Apagar conversa"
              aria-label="Apagar conversa"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          )}
          {messages.length > 2 && !streaming && (
            <button
              onClick={() => void compactConversation()}
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Compactar conversa"
              aria-label="Compactar conversa"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <polyline points="18 6 22 10 18 14" />
                <line x1="22" y1="10" x2="14" y2="10" />
                <polyline points="6 18 2 14 6 10" />
                <line x1="2" y1="14" x2="10" y2="14" />
                <line x1="12" y1="8" x2="12" y2="16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        onContextMenu={messagesCtxMenu.onContextMenu}
        className="flex-1 overflow-auto"
      >
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
      {messagesCtxMenu.menu}
    </div>
  );
};

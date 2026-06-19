import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chat_store';
import { Message } from './message';
import type { CommentEntry } from '../app_shell';
import {
  PencilIcon, TrashIcon, QuoteIcon, PlusIcon, ChevronDown,
  CompressIcon, Minus, ChatIcon, ChevronLeft, ChevronRight, CommentEmptyIcon, CloseIcon, FileIcon, HighlighterIcon,
} from '../icons';

/** Format a timestamp as a relative time string (pt-BR). */
function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'agora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

interface CommentCardProps {
  comment: CommentEntry;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUpdate: (text: string) => void;
}

const CommentCard: React.FC<CommentCardProps> = ({
  comment,
  index,
  selected,
  onSelect,
  onDelete,
  onUpdate,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.comment);

  useEffect(() => {
    setDraft(comment.comment);
  }, [comment.comment]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== comment.comment) onUpdate(trimmed);
    else setDraft(comment.comment);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(comment.comment);
    setEditing(false);
  };

  return (
    <div
      onClick={onSelect}
      className={`group relative px-3 py-2.5 border-b border-border cursor-pointer transition-colors ${
        selected ? 'bg-accent' : 'hover:bg-accent/50'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="text-muted-foreground shrink-0 mt-0.5"><QuoteIcon className="w-3 h-3" /></div>

        <div className="flex-1 min-w-0">
          {/* Texto destacado */}
          <p className="text-[11px] text-muted-foreground italic mb-1.5 line-clamp-2 break-words">
            &ldquo;{comment.text}&rdquo;
          </p>

          {/* Comentário ou editor */}
          {editing ? (
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancel();
                }
              }}
              rows={3}
              placeholder="Escreva seu comentário…"
              className="w-full resize-none text-xs px-2 py-1.5 border border-primary bg-card text-foreground rounded focus:outline-none"
            />
          ) : (
            <p className={`text-xs break-words ${comment.comment ? 'text-foreground' : 'text-muted-foreground italic'}`}>
              {comment.comment || '(sem comentário)'}
            </p>
          )}

          <span className="text-[10px] text-muted-foreground/70 mt-1 inline-block">
            #{index + 1}
          </span>
        </div>

        {/* Ações */}
        {!editing && (
          <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              title="Editar comentário"
              className="p-1 hover:bg-background rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              <PencilIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Apagar comentário"
              className="p-1 hover:bg-background rounded text-muted-foreground hover:text-destructive transition-colors"
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

interface ChatPanelProps {
  chatTab: 'chat' | 'comments';
  onSetTab: (tab: 'chat' | 'comments') => void;
  comments: CommentEntry[];
  commentIndex: number;
  onCommentIndexChange: (index: number) => void;
  onDeleteComment: (index: number) => void;
  onUpdateComment: (index: number, newComment: string) => void;
  onToggleChat?: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  chatTab,
  onSetTab,
  comments,
  commentIndex,
  onCommentIndexChange,
  onDeleteComment,
  onUpdateComment,
  onToggleChat,
}) => {
  const messages = useChatStore((s) => s.messages);
  const streaming = useChatStore((s) => s.streaming);
  const error = useChatStore((s) => s.error);
  const send = useChatStore((s) => s.send);
  const cancel = useChatStore((s) => s.cancel);
  const activeRequestId = useChatStore((s) => s.activeRequestId);
  const compactConversation = useChatStore((s) => s.compactConversation);
  const contextPages = useChatStore((s) => s.contextPages);
  const contextSnippets = useChatStore((s) => s.contextSnippets);
  const removePageContext = useChatStore((s) => s.removePageContext);
  const removeSnippetContext = useChatStore((s) => s.removeSnippetContext);
  const activeSession = useChatStore((s) => s.activeSession);
  const sessions = useChatStore((s) => s.sessions);
  const newConversation = useChatStore((s) => s.newConversation);
  const loadConversation = useChatStore((s) => s.loadConversation);

  const [input, setInput] = useState('');
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sessionMenuRef = useRef<HTMLDivElement | null>(null);

  // Close session menu on outside click
  useEffect(() => {
    if (!sessionMenuOpen) return;
    const handle = (e: MouseEvent) => {
      if (sessionMenuRef.current && !sessionMenuRef.current.contains(e.target as Node)) {
        setSessionMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handle);
    return () => window.removeEventListener('mousedown', handle);
  }, [sessionMenuOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    void send(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Chat view */}
      {chatTab === 'chat' && (
        <>
          {/* Header with actions */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <div ref={sessionMenuRef} className="relative">
                <button
                  onClick={() => setSessionMenuOpen((o) => !o)}
                  className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-accent rounded text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                  title="Histórico de conversas"
                  aria-label="Histórico de conversas"
                >
                  <span className="truncate max-w-[140px]">
                    {activeSession?.title ?? 'Atlas'}
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {sessionMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 min-w-[220px] max-h-[320px] overflow-auto bg-card border border-border rounded-lg shadow-lg py-1 text-sm animate-scale-in">
                    <button
                      onClick={() => { setSessionMenuOpen(false); void newConversation(); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-accent flex items-center gap-2 text-foreground"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-muted-foreground shrink-0">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      <span className="text-xs">Nova conversa</span>
                    </button>
                    {sessions.length > 0 && (
                      <>
                        <div className="h-px bg-border my-1" />
                        {sessions.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => { setSessionMenuOpen(false); void loadConversation(s.id); }}
                            className={`w-full text-left px-3 py-1.5 hover:bg-accent flex items-center gap-2 ${
                              s.id === activeSession?.id ? 'bg-accent/50' : ''
                            }`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-muted-foreground shrink-0">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            <div className="flex-1 min-w-0">
                              <span className="text-xs text-foreground block truncate">
                                {s.title ?? 'Sem título'}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {relativeTime(s.updatedAt)}
                                {typeof s.messageCount === 'number' ? ` · ${s.messageCount} msgs` : ''}
                              </span>
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Thinking / Writing indicator — animated dots */}
              {streaming && (
                <div className="flex items-center gap-1 ml-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-primary"
                    style={{ animation: 'dot-bounce 1.4s ease-in-out infinite', animationDelay: '0s' }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-primary"
                    style={{ animation: 'dot-bounce 1.4s ease-in-out infinite', animationDelay: '0.2s' }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-primary"
                    style={{ animation: 'dot-bounce 1.4s ease-in-out infinite', animationDelay: '0.4s' }}
                  />
                  <span className="text-[11px] text-muted-foreground ml-0.5">
                    {messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content
                      ? 'Gerando resposta...'
                      : 'Pensando...'}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => void newConversation()}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                title="Nova conversa"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </button>
              {messages.length > 2 && !streaming && (
                <button
                  onClick={() => void compactConversation()}
                  className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                  title="Compactar conversa"
                  aria-label="Compactar conversa"
                >
                  <CompressIcon className="w-3.5 h-3.5" />
                </button>
              )}
              {onToggleChat && (
                <button
                  onClick={onToggleChat}
                  className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                  title="Minimizar chat"
                  aria-label="Minimizar chat"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-3 animate-stagger">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground opacity-60 text-center mt-8">
                Converse com o Atlas. Configure sua API key da DeepSeek nas configurações ⚙
              </p>
            )}
            {messages.map((m) => (
              <Message key={m.id} message={m} streaming={streaming && m.id === activeRequestId} />
            ))}
            {error && (
              <div className="text-xs bg-destructive/10 border border-destructive/30 text-destructive rounded px-2 py-1">
                {error}
              </div>
            )}
          </div>

          {/* Context pages & snippets indicator */}
          {(contextPages.length > 0 || contextSnippets.length > 0) && (
            <div className="border-t border-border bg-accent/50 text-xs">
              {contextPages.map((p) => (
                <div key={p} className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 last:border-b-0">
                  <FileIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-muted-foreground truncate flex-1" title={p}>
                    {p}
                  </span>
                  <button
                    onClick={() => removePageContext(p)}
                    className="p-0.5 hover:bg-background rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Remover página do contexto"
                  >
                    <CloseIcon className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {contextSnippets.map((s, i) => (
                <div key={`s${i}`} className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 last:border-b-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-yellow-500 shrink-0">
                    <polyline points="4 7 4 4 20 4 20 7" />
                    <line x1="9" y1="20" x2="15" y2="20" />
                    <line x1="12" y1="4" x2="12" y2="20" />
                  </svg>
                  <span className="text-muted-foreground truncate flex-1" title={s}>
                    {s.length > 60 ? `${s.slice(0, 60)}…` : s}
                  </span>
                  <button
                    onClick={() => removeSnippetContext(i)}
                    className="p-0.5 hover:bg-background rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Remover trecho do contexto"
                  >
                    <CloseIcon className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="border-t border-border p-2 flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escreva uma mensagem…"
              rows={2}
              className="flex-1 resize-none text-sm px-2 py-1 border border-input bg-card text-foreground rounded focus:outline-none focus:border-primary"
            />
            {streaming ? (
              <button
                type="button"
                onClick={() => void cancel()}
                className="px-3 py-1 bg-destructive/20 text-destructive rounded text-sm hover:bg-destructive/30"
              >
                Parar
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm hover:brightness-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                Enviar
              </button>
            )}
          </form>
        </>
      )}

      {/* Comments view */}
      {chatTab === 'comments' && (
        <>
          {/* Back to Atlas button */}
          <div className="px-3 py-2 border-b border-border flex items-center gap-1">
            <button
              onClick={() => onSetTab('chat')}
              className="text-xs px-2.5 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              ← Atlas
            </button>
            <span className="text-xs text-muted-foreground ml-1">
              Comentários{comments.length > 0 ? ` (${comments.length})` : ''}
            </span>
          </div>

          {comments.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p className="text-xs text-muted-foreground text-center leading-relaxed">
                  Nenhum comentário nesta página.<br />
                  Selecione um texto no editor, clique com o botão direito e escolha <strong>Comentário</strong>.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Contador no topo */}
              <div className="px-3 py-1.5 border-b border-border bg-muted/30">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {comments.length} {comments.length === 1 ? 'comentário' : 'comentários'}
                </span>
              </div>

              {/* Lista de cards */}
              <div className="flex-1 overflow-auto animate-stagger">
                {comments.map((c, i) => (
                  <CommentCard
                    key={i}
                    comment={c}
                    index={i}
                    selected={i === commentIndex}
                    onSelect={() => onCommentIndexChange(i)}
                    onDelete={() => onDeleteComment(i)}
                    onUpdate={(text) => onUpdateComment(i, text)}
                  />
                ))}
              </div>

              {/* Navegação entre comentários */}
              <div className="border-t border-border px-3 py-1.5 flex items-center gap-2 bg-background">
                <button
                  onClick={() => onCommentIndexChange(Math.max(0, commentIndex - 1))}
                  disabled={commentIndex === 0}
                  className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-default transition-colors"
                  title="Comentário anterior"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <span className="flex-1 text-center text-[11px] text-muted-foreground tabular-nums">
                  {commentIndex + 1} / {comments.length}
                </span>
                <button
                  onClick={() => onCommentIndexChange(Math.min(comments.length - 1, commentIndex + 1))}
                  disabled={commentIndex >= comments.length - 1}
                  className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-default transition-colors"
                  title="Próximo comentário"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

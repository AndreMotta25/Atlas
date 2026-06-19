import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chat_store';
import { Message } from './message';
import type { CommentEntry } from '../app_shell';

const PENCIL_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const TRASH_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const QUOTE_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
    <path d="M9.5 7C7 7 5 9 5 11.5V18h6v-6H8.5c0-1.4 1.1-2.5 2.5-2.5V7H9.5zm9 0c-2.5 0-4.5 2-4.5 4.5V18h6v-6h-2.5c0-1.4 1.1-2.5 2.5-2.5V7h-1.5z" />
  </svg>
);

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
        <div className="text-muted-foreground shrink-0 mt-0.5">{QUOTE_ICON}</div>

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
              {PENCIL_ICON}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Apagar comentário"
              className="p-1 hover:bg-background rounded text-muted-foreground hover:text-destructive transition-colors"
            >
              {TRASH_ICON}
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

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Atlas
            </span>
            <div className="flex items-center gap-0.5">
              {messages.length > 2 && !streaming && (
                <button
                  onClick={() => void compactConversation()}
                  className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                  title="Compactar conversa"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                </button>
              )}
              {onToggleChat && (
                <button
                  onClick={onToggleChat}
                  className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                  title="Minimizar chat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-3">
            {/* Thinking / Typing indicator when streaming */}
            {streaming && (
              <div className="flex items-center gap-2 px-2 py-1.5 mb-2 rounded-md bg-muted/50 border border-border/50 text-xs text-muted-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-primary shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                <span>
                  {messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content
                    ? 'Gerando resposta...'
                    : 'Pensando...'}
                </span>
              </div>
            )}

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
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-primary shrink-0">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="text-muted-foreground truncate flex-1" title={p}>
                    {p}
                  </span>
                  <button
                    onClick={() => removePageContext(p)}
                    className="p-0.5 hover:bg-background rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Remover página do contexto"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
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
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
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
                className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm hover:brightness-90"
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
              <div className="flex-1 overflow-auto">
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

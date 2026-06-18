import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chat_store';
import { Message } from './message';

export const ChatPanel = () => {
  const messages = useChatStore((s) => s.messages);
  const streaming = useChatStore((s) => s.streaming);
  const error = useChatStore((s) => s.error);
  const send = useChatStore((s) => s.send);
  const cancel = useChatStore((s) => s.cancel);
  const activeRequestId = useChatStore((s) => s.activeRequestId);

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
      <div className="px-3 py-2 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Atlas IA
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-3">
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
    </div>
  );
};

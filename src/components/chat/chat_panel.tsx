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
    <div className="flex flex-col h-full bg-white">
      <div className="px-3 py-2 border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Atlas IA
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-slate-400 text-center mt-8">
            Converse com o Atlas. Configure sua API key da DeepSeek nas configurações ⚙
          </p>
        )}
        {messages.map((m) => (
          <Message key={m.id} message={m} streaming={streaming && m.id === activeRequestId} />
        ))}
        {error && (
          <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded px-2 py-1">
            {error}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-200 p-2 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escreva uma mensagem…"
          rows={2}
          className="flex-1 resize-none text-sm px-2 py-1 border border-slate-300 rounded focus:outline-none focus:border-blue-500"
        />
        {streaming ? (
          <button
            type="button"
            onClick={() => void cancel()}
            className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
          >
            Parar
          </button>
        ) : (
          <button
            type="submit"
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Enviar
          </button>
        )}
      </form>
    </div>
  );
};

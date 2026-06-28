import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { Components } from 'react-markdown';
import type { ChatMessage } from '../../types';
import { ConfirmCard } from './confirm_card';
import { ToolResultCard } from './tool_result_card';
import { parseActions } from './parse_actions';
import { useChatStore } from '../../stores/chat_store';
import { CopyIcon, CheckIcon } from '../icons';

interface MessageProps {
  message: ChatMessage;
  streaming?: boolean;
  /** True when this is the last message in the list — actions only render here. */
  isLast?: boolean;
}

const TABLE_CELL = 'border border-solid border-border px-2 py-1';
const TABLE_HEAD = `${TABLE_CELL} bg-muted font-semibold text-left`;

const markdownComponents: Components = {
  table: (props) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-xs border-collapse border border-solid border-border" {...props} />
    </div>
  ),
  thead: (props) => <thead {...props} />,
  tbody: (props) => <tbody {...props} />,
  tr: (props) => <tr className="border-b border-solid border-border" {...props} />,
  th: (props) => <th className={TABLE_HEAD} {...props} />,
  td: (props) => <td className={TABLE_CELL} {...props} />,
};

export const Message: React.FC<MessageProps> = ({ message, streaming, isLast }) => {
  const isUser = message.role === 'user';
  const confirmToolCall = useChatStore((s) => s.confirmToolCall);
  const rejectToolCall = useChatStore((s) => s.rejectToolCall);
  const undoLast = useChatStore((s) => s.undoLast);
  const send = useChatStore((s) => s.send);

  const [actionsUsed, setActionsUsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only parse + render action buttons for the latest assistant message,
  // when not actively streaming, and not yet used.
  const { cleanContent, actions } = useMemo(
    () => (isUser ? { cleanContent: message.content, actions: [] } : parseActions(message.content)),
    [message.content, isUser],
  );
  const showActions = !isUser && isLast === true && !streaming && actions.length > 0 && !actionsUsed;

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    const text = (cleanContent ?? message.content).trim();
    if (!text) return;
    try {
      const result = await window.electronAPI.clipboard.writeText(text);
      if (!result.success) {
        console.error('Falha ao copiar mensagem:', result.error);
        return;
      }
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Falha ao copiar mensagem:', err);
    }
  };

  const hasToolCalls = (message.toolCalls?.length ?? 0) > 0;
  const hasToolResults = (message.toolResults?.length ?? 0) > 0;

  return (
    <div className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
      {/* Tool results (read-only tools — list_pages, read_page, search, get_backlinks)
           appear BEFORE the assistant response so the user sees what was read/searched first. */}
      {hasToolResults && message.toolResults && (
        <div className="w-full max-w-[95%] flex flex-col gap-1.5">
          {message.toolResults.map((tr) => (
            <ToolResultCard key={tr.toolCallId} result={tr} />
          ))}
        </div>
      )}

      {/* Pending write tool calls (create_page, edit_page) */}
      {hasToolCalls && message.toolCalls && (
        <div className="w-full max-w-[95%] flex flex-col gap-1.5">
          {message.toolCalls.map((tc) => (
            <ConfirmCard
              key={tc.toolCallId}
              toolCall={tc}
              onConfirm={confirmToolCall}
              onReject={rejectToolCall}
              onUndo={undoLast}
            />
          ))}
        </div>
      )}

      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : cleanContent ? (
          <div className="max-w-none text-sm leading-relaxed atlas-chat-content [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-0.5 [&_pre]:bg-card [&_pre]:text-foreground [&_pre]:rounded [&_pre]:p-2 [&_pre]:border [&_pre]:border-border [&_code]:font-mono [&_code]:text-xs [&_h1]:font-bold [&_h1]:text-base [&_h2]:font-semibold [&_h2]:text-sm [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:font-medium [&_h3]:text-sm [&_h3]:mt-2 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote]:italic [&_table]:text-xs [&_table]:border-collapse [&_table]:border [&_table]:border-solid [&_table]:border-border [&_th]:border [&_th]:border-solid [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted [&_td]:border [&_td]:border-solid [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_hr]:border-border [&_strong]:font-semibold">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>{cleanContent}</ReactMarkdown>
            {streaming && <span className="animate-pulse">▍</span>}
          </div>
        ) : streaming ? (
          /* Thinking/writing is now shown in the header — keep a minimal
             placeholder so the bubble doesn't look empty while streaming. */
          <div className="h-4" />
        ) : !hasToolCalls && !hasToolResults ? (
          <div className="text-muted-foreground italic">(vazio)</div>
        ) : null}
      </div>

      {/* Mini copy button — aligned to the same side as the bubble */}
      {(cleanContent || message.content) && (
        <div className={`w-full max-w-[90%] flex ${isUser ? 'justify-end' : 'justify-start'}`}>
          <button
            type="button"
            onClick={handleCopy}
            disabled={streaming && !message.content.trim()}
            title={copied ? 'Copiado!' : 'Copiar mensagem'}
            aria-label={copied ? 'Copiado!' : 'Copiar mensagem'}
            className={`inline-flex items-center justify-center p-1 rounded transition-colors ${
              copied
                ? 'text-green-600 dark:text-green-400'
                : 'text-muted-foreground/70 hover:text-foreground hover:bg-accent'
            } disabled:opacity-40 disabled:cursor-default`}
          >
            {copied ? (
              <CheckIcon className="w-3.5 h-3.5" />
            ) : (
              <CopyIcon className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      )}

      {/* Quick action buttons (force user interaction instead of typing yes/no) */}
      {showActions && (
        <div className="w-full max-w-[90%] flex flex-wrap gap-1.5 mt-1">
          {actions.map((label, idx) => (
            <button
              key={`${label}-${idx}`}
              onClick={() => {
                setActionsUsed(true);
                void send(label);
              }}
              className="px-3 py-1 rounded-md border border-border bg-card text-foreground text-xs hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

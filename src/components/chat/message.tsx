import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { ChatMessage } from '../../types';
import { ConfirmCard } from './confirm_card';
import { ToolResultCard } from './tool_result_card';
import { useChatStore } from '../../stores/chat_store';

interface MessageProps {
  message: ChatMessage;
  streaming?: boolean;
}

export const Message: React.FC<MessageProps> = ({ message, streaming }) => {
  const isUser = message.role === 'user';
  const confirmToolCall = useChatStore((s) => s.confirmToolCall);
  const rejectToolCall = useChatStore((s) => s.rejectToolCall);
  const undoLast = useChatStore((s) => s.undoLast);

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
        ) : message.content ? (
          <div className="max-w-none text-sm leading-relaxed [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_pre]:bg-card [&_pre]:text-foreground [&_pre]:rounded [&_pre]:p-2 [&_code]:font-mono [&_code]:text-xs [&_h1]:font-bold [&_h1]:text-base [&_h2]:font-semibold [&_h2]:text-sm [&_a]:text-primary [&_a]:underline">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{message.content}</ReactMarkdown>
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
    </div>
  );
};

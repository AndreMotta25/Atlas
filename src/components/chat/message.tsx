import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../../types';

interface MessageProps {
  message: ChatMessage;
  streaming?: boolean;
}

export const Message: React.FC<MessageProps> = ({ message, streaming }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-slate-100 text-slate-900'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : message.content ? (
          <div className="max-w-none text-sm leading-relaxed [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_pre]:bg-slate-800 [&_pre]:text-slate-100 [&_pre]:rounded [&_pre]:p-2 [&_code]:font-mono [&_code]:text-xs [&_h1]:font-bold [&_h1]:text-base [&_h2]:font-semibold [&_h2]:text-sm [&_a]:text-blue-600 [&_a]:underline">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            {streaming && <span className="animate-pulse">▍</span>}
          </div>
        ) : streaming ? (
          <div className="text-slate-400 italic">digitando…</div>
        ) : (
          <div className="text-slate-400 italic">(vazio)</div>
        )}
      </div>
    </div>
  );
};

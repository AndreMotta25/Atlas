import { useState } from 'react';
import type { ToolResultPayload } from '../../types';

interface ToolResultCardProps {
  result: ToolResultPayload;
}

const READ_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const LIST_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const CREATE_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="18" x2="12" y2="12" />
    <line x1="9" y1="15" x2="15" y2="15" />
  </svg>
);

const EDIT_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z" />
  </svg>
);

const ICONS: Record<string, React.ReactNode> = {
  read_page: READ_ICON,
  list_pages: LIST_ICON,
  create_page: CREATE_ICON,
  edit_page: EDIT_ICON,
  search: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  get_backlinks: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  web_search: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  web_extract: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
};

const LABELS: Record<string, string> = {
  read_page: 'Página lida',
  list_pages: 'Listagem',
  create_page: 'Página criada',
  edit_page: 'Página editada',
  search: 'Busca',
  get_backlinks: 'Backlinks',
  web_search: 'Pesquisa web',
  web_extract: 'Extração web',
};

const CHEVRON_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0 transition-transform duration-150">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export const ToolResultCard: React.FC<ToolResultCardProps> = ({ result }) => {
  const [collapsed, setCollapsed] = useState(result.toolName === 'read_page');
  const hasBody = !!(result.error || result.content || result.path);

  const icon = ICONS[result.toolName] ?? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
  const label = LABELS[result.toolName] ?? result.toolName;

  return (
    <div className="border border-border rounded-md bg-card/60 text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => hasBody && setCollapsed((c) => !c)}
        className={`w-full px-2.5 py-1.5 border-b border-border flex items-center gap-2 bg-muted/40 ${
          hasBody ? 'cursor-pointer hover:bg-muted/60' : 'cursor-default'
        }`}
      >
        <span className="shrink-0">{icon}</span>
        <span className="font-medium">{label}</span>
        {typeof result.count === 'number' && (
          <span className="text-muted-foreground">· {result.count} itens</span>
        )}
        {result.error && (
          <span className="text-destructive truncate" title={result.error}>
            erro
          </span>
        )}
        {hasBody && (
          <span className={`ml-auto ${collapsed ? '' : 'rotate-180'}`}>
            {CHEVRON_ICON}
          </span>
        )}
      </button>

      {!collapsed && (
        <>
          {result.error ? (
            <div className="px-2.5 py-2 text-destructive">{result.error}</div>
          ) : result.content ? (
            <pre className="px-2.5 py-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/90">
              {result.content.length > 800
                ? `${result.content.slice(0, 800)}…`
                : result.content}
            </pre>
          ) : result.path ? (
            <div className="px-2.5 py-2 font-mono text-[11px] text-muted-foreground break-all">
              {result.path}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

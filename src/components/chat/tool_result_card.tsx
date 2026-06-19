import type { ToolResultPayload } from '../../types';

interface ToolResultCardProps {
  result: ToolResultPayload;
}

const ICONS: Record<string, string> = {
  read_page: '📖',
  list_pages: '📋',
  create_page: '✨',
  edit_page: '✏️',
};

const LABELS: Record<string, string> = {
  read_page: 'Página lida',
  list_pages: 'Listagem',
  create_page: 'Página criada',
  edit_page: 'Página editada',
};

export const ToolResultCard: React.FC<ToolResultCardProps> = ({ result }) => {
  const icon = ICONS[result.toolName] ?? '🔧';
  const label = LABELS[result.toolName] ?? result.toolName;

  return (
    <div className="border border-border rounded-md bg-card/60 text-xs overflow-hidden">
      <div className="px-2.5 py-1.5 border-b border-border flex items-center gap-2 bg-muted/40">
        <span>{icon}</span>
        <span className="font-medium">{label}</span>
        {typeof result.count === 'number' && (
          <span className="text-muted-foreground">· {result.count} itens</span>
        )}
        {result.error && (
          <span className="text-destructive ml-auto truncate" title={result.error}>
            erro
          </span>
        )}
      </div>

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
    </div>
  );
};

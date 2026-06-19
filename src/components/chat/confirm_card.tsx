import type { EditPageMode, PendingToolCall } from '../../types';

interface ConfirmCardProps {
  toolCall: PendingToolCall;
  onConfirm: (toolCallId: string) => void;
  onReject: (toolCallId: string) => void;
  onUndo: () => void;
}

const ICONS: Record<string, string> = {
  create_page: '✨',
  edit_page: '✏️',
};

const MODE_LABEL: Record<EditPageMode, string> = {
  replace: 'substituir tudo',
  append: 'anexar',
  replace_section: 'substituir seção',
};

const argStr = (a: Record<string, unknown>, key: string): string =>
  typeof a[key] === 'string' ? (a[key] as string) : '';

export const ConfirmCard: React.FC<ConfirmCardProps> = ({
  toolCall,
  onConfirm,
  onReject,
  onUndo,
}) => {
  const { args, status, toolName, toolCallId } = toolCall;
  const path = argStr(args, 'path');
  const content = argStr(args, 'content');
  const mode = typeof args.mode === 'string' ? (args.mode as EditPageMode) : undefined;
  const section = argStr(args, 'section');

  const title =
    toolName === 'create_page'
      ? 'Criar página'
      : `Editar página${mode ? ` · ${MODE_LABEL[mode]}` : ''}`;

  return (
    <div className="border border-border rounded-md bg-card text-xs overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-2.5 py-1.5 border-b border-border flex items-center gap-2 bg-muted/40">
        <span>{ICONS[toolName] ?? '🔧'}</span>
        <span className="font-medium">{title}</span>
        {section && (
          <span className="text-muted-foreground truncate" title={section}>
            · seção "{section}"
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/80 truncate max-w-[50%]" title={path}>
          {path}
        </span>
      </div>

      {/* Body — preview of the proposed content.
          DiffView (previous vs new) is shown post-apply via ToolResultCard when
          previousContent is available; here we just preview what will be written. */}
      <div className="p-2 max-h-56 overflow-y-auto bg-background/30">
        <pre className="text-[11px] font-mono whitespace-pre-wrap break-words text-foreground/90">
          {content || '(vazio)'}
        </pre>
      </div>

      {/* Footer — state-dependent actions */}
      <div className="px-2.5 py-1.5 border-t border-border flex items-center justify-end gap-2 bg-muted/30">
        {status === 'pending' && (
          <>
            <button
              onClick={() => onReject(toolCallId)}
              className="px-2 py-0.5 text-[11px] text-muted-foreground hover:text-destructive border border-border rounded transition-colors"
            >
              Rejeitar
            </button>
            <button
              onClick={() => onConfirm(toolCallId)}
              className="px-2.5 py-0.5 text-[11px] bg-primary text-primary-foreground rounded hover:brightness-90 transition-all"
            >
              Aceitar
            </button>
          </>
        )}
        {status === 'applied' && (
          <>
            <span className="text-[11px] text-green-600 dark:text-green-400">✓ aplicado</span>
            <button
              onClick={onUndo}
              className="px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground border border-border rounded transition-colors"
              title="Desfazer última operação"
            >
              Desfazer
            </button>
          </>
        )}
        {status === 'rejected' && (
          <span className="text-[11px] text-muted-foreground italic">rejeitado</span>
        )}
        {status === 'undone' && (
          <span className="text-[11px] text-muted-foreground italic">desfeito</span>
        )}
      </div>
    </div>
  );
};

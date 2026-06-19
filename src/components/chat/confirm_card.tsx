import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { EditPageMode, PendingToolCall } from '../../types';
import { DiffView } from './diff_view';

interface ConfirmCardProps {
  toolCall: PendingToolCall;
  onConfirm: (toolCallId: string) => void;
  onReject: (toolCallId: string) => void;
  onUndo: () => void;
}

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

const MODE_LABEL: Record<EditPageMode, string> = {
  replace: 'Substituir todo o conteúdo',
  append: 'Adicionar ao final',
  replace_section: 'Substituir seção específica',
};

const MODE_DESC: Record<EditPageMode, string> = {
  replace: 'O conteúdo existente será completamente substituído pelo novo texto.',
  append: 'O novo texto será adicionado ao final da página.',
  replace_section: 'Apenas a seção indicada será substituída; o restante permanece intacto.',
};

const argStr = (a: Record<string, unknown>, key: string): string =>
  typeof a[key] === 'string' ? (a[key] as string) : '';

/**
 * Mirror of ToolExecutor.sectionReplace — used only to PREVIEW the diff before
 * the user accepts. The authoritative merge still runs in the main process.
 */
const previewSectionReplace = (content: string, sectionName: string, newBody: string): string => {
  const lines = content.split('\n');
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingRe = new RegExp(`^(#{1,6})\\s+${escaped}\\s*$`, 'i');
  const headingIdx = lines.findIndex((l) => headingRe.test(l));
  if (headingIdx === -1) {
    const sep = content.length > 0 && !content.endsWith('\n') ? '\n\n' : '\n';
    return content + sep + `## ${sectionName}\n` + newBody;
  }
  const headingLine = lines[headingIdx];
  const headingMatch = headingLine.match(/^(#{1,6})/);
  if (!headingMatch) return content;
  const level = headingMatch[1].length;
  const boundaryRe = new RegExp(`^#{1,${level}}\\s`);
  let endIdx = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (boundaryRe.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  const bodyLines = newBody.split('\n');
  return [
    ...lines.slice(0, headingIdx),
    headingLine,
    ...bodyLines,
    ...lines.slice(endIdx),
  ].join('\n');
};

/** Compute the resulting content of an edit operation, for preview only. */
const computePreviewResult = (
  mode: EditPageMode,
  prior: string,
  body: string,
  section?: string,
): string => {
  switch (mode) {
    case 'replace':
      return body;
    case 'append':
      return prior.endsWith('\n') ? prior + '\n' + body : prior + '\n\n' + body;
    case 'replace_section':
      return previewSectionReplace(prior, section ?? '', body);
  }
};

type ViewMode = 'content' | 'diff';

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

  const isCreate = toolName === 'create_page';
  const isEdit = toolName === 'edit_page' && !!mode;

  // For edit_page: fetch current content so we can show a real diff before accept.
  const [priorContent, setPriorContent] = useState<string | null | undefined>(undefined);
  const [view, setView] = useState<ViewMode>(isEdit ? 'diff' : 'content');

  useEffect(() => {
    if (!isEdit || status !== 'pending') return;
    let cancelled = false;
    api.vault
      .readPage(path)
      .then((page) => {
        if (!cancelled) setPriorContent(page.content);
      })
      .catch(() => {
        if (!cancelled) setPriorContent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, status, path]);

  const previewResult =
    isEdit && mode && priorContent !== undefined && priorContent !== null
      ? computePreviewResult(mode, priorContent, content, section)
      : null;

  const canShowDiff = isEdit && priorContent !== undefined && priorContent !== null;
  const diffReady = canShowDiff && previewResult !== null;

  return (
    <div className="border border-border rounded-md bg-card text-xs overflow-hidden shadow-sm">
      {/* Header — ação clara */}
      <div className={`px-3 py-2 border-b border-border flex items-center gap-2 ${
        isCreate ? 'bg-success/10' : 'bg-primary/5'
      }`}>
        <span className="shrink-0">{isCreate ? CREATE_ICON : EDIT_ICON}</span>
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-foreground text-sm block leading-tight">
            {isCreate ? 'Criar nova página' : 'Editar página existente'}
          </span>
          <span className="text-muted-foreground text-[11px] block truncate mt-0.5" title={path}>
            {path || '(caminho não especificado)'}
          </span>
        </div>
      </div>

      {/* Modo da edição (se aplicável) */}
      {mode && (
        <div className="px-3 py-1.5 border-b border-border bg-muted/20 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-muted-foreground shrink-0">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span className="text-muted-foreground">{MODE_LABEL[mode]}</span>
          {section && (
            <span className="text-muted-foreground/70 truncate" title={section}>
              · seção &ldquo;{section}&rdquo;
            </span>
          )}
        </div>
      )}

      {/* Descrição do efeito */}
      {mode && (
        <div className="px-3 py-1.5 border-b border-border bg-muted/10">
          <p className="text-[11px] text-muted-foreground italic leading-relaxed">
            {MODE_DESC[mode]}
          </p>
        </div>
      )}

      {/* Toggle Conteúdo / Diff — só para edit_page com preview disponível */}
      {canShowDiff && status === 'pending' && (
        <div className="flex border-b border-border bg-muted/20 text-[10px] font-medium uppercase tracking-wide">
          <button
            type="button"
            onClick={() => setView('diff')}
            className={`flex-1 px-3 py-1 transition-colors ${
              view === 'diff'
                ? 'text-foreground bg-card'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Diff
          </button>
          <button
            type="button"
            onClick={() => setView('content')}
            className={`flex-1 px-3 py-1 border-l border-border transition-colors ${
              view === 'content'
                ? 'text-foreground bg-card'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Conteúdo final
          </button>
        </div>
      )}

      {/* Body — preview do conteúdo / diff */}
      <div className="p-2.5 max-h-48 overflow-y-auto bg-background/30">
        {view === 'diff' && diffReady ? (
          <DiffView oldText={priorContent ?? ''} newText={previewResult ?? ''} />
        ) : (
          <>
            <div className="flex items-center gap-1.5 mb-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-muted-foreground">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {isCreate
                  ? 'Conteúdo da nova página'
                  : view === 'diff'
                    ? 'Conteúdo a ser escrito'
                    : 'Conteúdo resultante'}
              </span>
            </div>
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-words text-foreground/90 border border-border/50 rounded p-2 bg-card/50">
              {view === 'content' && previewResult
                ? previewResult || <span className="text-muted-foreground italic">(vazio)</span>
                : content || <span className="text-muted-foreground italic">(conteúdo vazio)</span>}
            </pre>
          </>
        )}
      </div>

      {/* Footer — ações conforme status */}
      <div className="px-3 py-2 border-t border-border flex items-center justify-end gap-2 bg-muted/30">
        {status === 'pending' && (
          <>
            <button
              onClick={() => onReject(toolCallId)}
              className="px-2.5 py-1 text-[11px] text-muted-foreground hover:text-destructive border border-border rounded transition-colors flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Rejeitar
            </button>
            <button
              onClick={() => onConfirm(toolCallId)}
              className="px-3 py-1 text-[11px] bg-primary text-primary-foreground rounded hover:brightness-90 transition-all flex items-center gap-1 font-medium"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Aceitar e executar
            </button>
          </>
        )}
        {status === 'applied' && (
          <>
            <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              Aplicado
            </span>
            <button
              onClick={onUndo}
              className="px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground border border-border rounded transition-colors flex items-center gap-1"
              title="Desfazer última operação"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              Desfazer
            </button>
          </>
        )}
        {status === 'rejected' && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground italic">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            Rejeitado
          </span>
        )}
        {status === 'undone' && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground italic">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            Desfeito
          </span>
        )}
      </div>
    </div>
  );
};

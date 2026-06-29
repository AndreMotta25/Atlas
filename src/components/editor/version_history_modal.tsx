import { useEffect, useState, useCallback } from 'react';
import { diffLines } from 'diff';
import { api } from '../../lib/api';
import type { PageVersion, PageVersionMeta } from '../../types';
import { CloseIcon } from '../icons';

interface VersionHistoryModalProps {
  pagePath: string;
  currentContent: string;
  onClose: () => void;
  onRestored: (path: string, content: string) => void;
}

const formatDate = (ms: number): string => {
  const d = new Date(ms);
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${date} ${time}`;
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  pagePath,
  currentContent,
  onClose,
  onRestored,
}) => {
  const [versions, setVersions] = useState<PageVersionMeta[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedFull, setSelectedFull] = useState<PageVersion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.versions.list(pagePath);
      setVersions(list);
      setSelectedId(list.length > 0 ? list[0].id : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar versões');
    } finally {
      setLoading(false);
    }
  }, [pagePath]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // Load full version (with content) whenever selection changes.
  useEffect(() => {
    if (selectedId === null) {
      setSelectedFull(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const full = await api.versions.get(selectedId);
        if (!cancelled) setSelectedFull(full);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar versão');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Esc closes the modal.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleRestore = async () => {
    if (selectedId === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.versions.restore(selectedId);
      if (result.success && result.path && result.content !== undefined) {
        await loadList(); // refresh to show the new pre-restore entry
        setConfirmingRestore(false);
        onRestored(result.path, result.content);
        onClose();
      } else {
        setError(result.error ?? 'Falha ao restaurar versão');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao restaurar');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (selectedId === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.versions.delete(selectedId);
      if (result.success) {
        setSelectedId(null);
        setSelectedFull(null);
        await loadList();
      } else {
        setError(result.error ?? 'Falha ao excluir versão');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir');
    } finally {
      setBusy(false);
    }
  };

  // Compute line diff: removed/added lines relative to current content.
  const diffParts = (() => {
    if (!selectedFull) return null;
    // diffLines(old=selectedFull.content, new=currentContent) → parts where
    //   removed: lines only in the snapshot (gone in current)
    //   added:   lines only in current (new since snapshot)
    return diffLines(selectedFull.content, currentContent, { newlineIsToken: false });
  })();

  const isIdentical =
    diffParts !== null && diffParts.length === 1 && !diffParts[0].added && !diffParts[0].removed;

  const pageName = pagePath.split(/[\\/]/).pop() ?? pagePath;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-lg shadow-xl dark:shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-foreground">Histórico de versões</h2>
            <span className="text-xs text-muted-foreground">{pageName}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            <CloseIcon />
          </button>
        </header>

        {error && (
          <div className="px-5 py-2 bg-red-500/10 border-b border-red-500/30 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex-1 flex min-h-0">
          {/* Left: list */}
          <aside className="w-64 border-r border-border overflow-y-auto">
            {loading && versions.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
            ) : versions.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                Nenhuma versão salva ainda. Use o botão “Salvar versão” no editor.
              </div>
            ) : (
              <ul className="py-1">
                {versions.map((v) => {
                  const isActive = v.id === selectedId;
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(v.id)}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-accent text-accent-foreground'
                            : 'hover:bg-muted/60 text-foreground'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs">{formatDate(v.createdAt)}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatSize(v.size)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          {v.source === 'pre-restore' ? (
                            <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400">
                              pré-restore
                            </span>
                          ) : (
                            <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                              manual
                            </span>
                          )}
                          {v.label && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              {v.label}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* Right: diff / preview */}
          <section className="flex-1 min-w-0 overflow-auto bg-muted/5">
            {!selectedFull ? (
              <div className="p-6 text-sm text-muted-foreground">
                Selecione uma versão à esquerda para ver a diferença em relação ao conteúdo atual.
              </div>
            ) : isIdentical ? (
              <div className="p-6 text-sm text-muted-foreground">
                Esta versão é idêntica ao conteúdo atual.
              </div>
            ) : (
              <pre className="text-xs font-mono leading-relaxed p-4 whitespace-pre-wrap break-words">
                {diffParts?.map((part, idx) => {
                  const cls = part.added
                    ? 'bg-green-500/10 text-green-700 dark:text-green-300'
                    : part.removed
                      ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                      : 'text-muted-foreground';
                  const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
                  // `diffLines` includes the trailing `\n` in each part's value,
                  // which would produce a phantom empty line after split. Strip
                  // exactly one trailing newline before splitting — empty lines
                  // in the middle of a part are preserved.
                  const text = part.value.endsWith('\n')
                    ? part.value.slice(0, -1)
                    : part.value;
                  return (
                    <span key={idx} className={`block ${cls}`}>
                      {text
                        .split('\n')
                        .map((line, i) => (
                          <span key={i} className="block">
                            {prefix}
                            {line}
                          </span>
                        ))}
                    </span>
                  );
                })}
              </pre>
            )}
          </section>
        </div>

        <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border">
          <div className="text-xs text-muted-foreground">
            {selectedFull &&
              `${formatDate(selectedFull.createdAt)} • ${formatSize(selectedFull.size)}`}
          </div>
          <div className="flex items-center gap-2">
            {confirmingRestore ? (
              <>
                <span className="text-sm text-foreground">Confirmar restauração?</span>
                <button
                  type="button"
                  onClick={() => setConfirmingRestore(false)}
                  disabled={busy}
                  className="px-3 py-1.5 text-sm rounded border border-border text-foreground hover:bg-muted disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={busy}
                  className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy ? 'Restaurando…' : 'Restaurar'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={selectedId === null || busy}
                  className="px-3 py-1.5 text-sm rounded border border-red-500/40 text-red-600 hover:bg-red-500/10 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Excluir
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRestore(true)}
                  disabled={selectedId === null || busy}
                  className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Restaurar versão
                </button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};

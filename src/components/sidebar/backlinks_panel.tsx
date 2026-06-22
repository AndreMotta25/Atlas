import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useVaultStore } from '../../stores/vault_store';
import { FileIcon, SpinnerIcon, ChevronLeft, LinkIcon, ArrowUpRight } from '../icons';
import type { BacklinkResult } from '../../types';

interface BacklinksPanelProps {
  onBack: () => void;
}

export const BacklinksPanel: React.FC<BacklinksPanelProps> = ({ onBack }) => {
  const currentPath = useVaultStore((s) => s.currentPath);
  const openPage = useVaultStore((s) => s.openPage);
  const [backlinks, setBacklinks] = useState<BacklinkResult[]>([]);
  const [loading, setLoading] = useState(true);
  const backlinksRequestRef = useRef(0);

  useEffect(() => {
    if (!currentPath) {
      setBacklinks([]);
      setLoading(false);
      return;
    }
    const reqId = ++backlinksRequestRef.current;
    setLoading(true);
    api.vault.backlinks(currentPath).then((result) => {
      if (reqId === backlinksRequestRef.current) {
        setBacklinks(result);
        setLoading(false);
      }
    }).catch((err) => {
      console.error('[BacklinksPanel] Failed to load backlinks:', err);
      if (reqId === backlinksRequestRef.current) setLoading(false);
    });
  }, [currentPath]);

  // Refresh backlinks when vault files change
  useEffect(() => {
    if (!currentPath) return;
    const unsub = api.vault.onChanged((evt) => {
      if (evt.type === 'add' || evt.type === 'change' || evt.type === 'unlink') {
        const reqId = ++backlinksRequestRef.current;
        api.vault.backlinks(currentPath).then((result) => {
          if (reqId === backlinksRequestRef.current) {
            setBacklinks(result);
          }
        }).catch((err) => {
          console.error('[BacklinksPanel] Failed to refresh backlinks:', err);
        });
      }
    });
    return unsub;
  }, [currentPath]);

  const handleOpenPage = useCallback(async (path: string) => {
    try {
      await openPage(path);
    } catch (err) {
      console.error('[BacklinksPanel] Failed to open page:', path, err);
    }
  }, [openPage]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="px-2 py-1.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={onBack}
            className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Fechar painel"
            aria-label="Fechar painel"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">
            Backlinks
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground/60 shrink-0">
          {backlinks.length}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="px-3 py-6 text-center">
            <SpinnerIcon className="w-5 h-5 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">Carregando backlinks…</p>
          </div>
        ) : backlinks.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <LinkIcon className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">Nenhum backlink encontrado.</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Outras páginas que apontam para esta aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="animate-stagger">
            <div className="px-3 py-1 bg-muted/20 border-b border-border/50">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                Páginas que linkam para esta ({backlinks.length})
              </span>
            </div>
            {backlinks.map((b) => (
              <button
                key={b.fromPath + (b.anchor ?? '')}
                onClick={() => void handleOpenPage(b.fromPath)}
                className="w-full text-left px-3 py-2 hover:bg-accent border-b border-border/50 transition-colors group flex items-start gap-2"
              >
                <div className="flex items-center gap-1.5 shrink-0">
                  <FileIcon className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <ArrowUpRight className="w-3 h-3 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-medium text-foreground block truncate group-hover:text-primary transition-colors">
                    {b.fromTitle}
                  </span>
                  <span className="text-[10px] text-muted-foreground block mt-0.5 truncate">
                    {b.fromPath}
                  </span>
                  {b.anchor && (
                    <span className="text-[10px] text-muted-foreground/60 block mt-0.5">
                      âncora: <code className="text-muted-foreground font-mono">#{b.anchor}</code>
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
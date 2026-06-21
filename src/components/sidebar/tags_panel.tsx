import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useVaultStore } from '../../stores/vault_store';
import { FileIcon, SpinnerIcon, ChevronLeft, TagIcon } from '../icons';
import type { TagResult, TagPageResult } from '../../types';

interface TagsPanelProps {
  onBack: () => void;
}

export const TagsPanel: React.FC<TagsPanelProps> = ({ onBack }) => {
  const openPage = useVaultStore((s) => s.openPage);
  const [tags, setTags] = useState<TagResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [pages, setPages] = useState<TagPageResult[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const tagRequestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.vault.tags().then((result) => {
      if (!cancelled) {
        setTags(result);
        setLoading(false);
      }
    }).catch((err) => {
      console.error('[TagsPanel] Failed to load tags:', err);
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Refresh tags when vault files change (add, change, unlink).
  useEffect(() => {
    const unsub = api.vault.onChanged((evt) => {
      if (evt.type === 'add' || evt.type === 'change' || evt.type === 'unlink') {
        api.vault.tags().then((result) => {
          setTags(result);
        }).catch((err) => {
          console.error('[TagsPanel] Failed to refresh tags:', err);
        });
        // If a tag is selected, also refresh its pages.
        setSelectedTag((current) => {
          if (current) {
            api.vault.pagesByTag(current).then((result) => {
              setPages(result);
            }).catch((err) => {
              console.error('[TagsPanel] Failed to refresh pages:', err);
            });
          }
          return current;
        });
      }
    });
    return unsub;
  }, []);

  const handleSelectTag = useCallback(async (tag: string) => {
    setSelectedTag(tag);
    setPages([]);
    setLoadingPages(true);
    const reqId = ++tagRequestRef.current;
    try {
      const result = await api.vault.pagesByTag(tag);
      if (reqId === tagRequestRef.current) {
        setPages(result);
        setLoadingPages(false);
      }
    } catch (err) {
      console.error('[TagsPanel] Failed to load pages for tag:', tag, err);
      if (reqId === tagRequestRef.current) {
        setPages([]);
        setLoadingPages(false);
      }
    }
  }, []);

  const handleOpenPage = useCallback(async (path: string) => {
    try {
      await openPage(path);
    } catch (err) {
      console.error('[TagsPanel] Failed to open page:', path, err);
    }
  }, [openPage]);

  const handleBack = useCallback(() => {
    if (selectedTag) {
      setSelectedTag(null);
      setPages([]);
    } else {
      onBack();
    }
  }, [selectedTag, onBack]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="px-2 py-1.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={handleBack}
            className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
            title={selectedTag ? 'Voltar para tags' : 'Fechar painel'}
            aria-label={selectedTag ? 'Voltar para tags' : 'Fechar painel'}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">
            {selectedTag ? `#${selectedTag}` : 'Tags'}
          </span>
        </div>
        {!selectedTag && (
          <span className="text-[10px] text-muted-foreground/60 shrink-0">
            {tags.length}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="px-3 py-6 text-center">
            <SpinnerIcon className="w-5 h-5 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">Carregando tags…</p>
          </div>
        ) : !selectedTag ? (
          /* Tag list */
          tags.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <TagIcon className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">Nenhuma tag encontrada.</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Use #tag nos seus arquivos markdown.
              </p>
            </div>
          ) : (
            <div className="animate-stagger">
              {tags.map((t) => (
                <button
                  key={t.tag}
                  onClick={() => void handleSelectTag(t.tag)}
                  className="w-full text-left px-3 py-2 hover:bg-accent border-b border-border/50 transition-colors group flex items-center gap-2"
                >
                  <TagIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    #{t.tag}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground/60 shrink-0">
                    {t.count}
                  </span>
                </button>
              ))}
            </div>
          )
        ) : (
          /* Pages for selected tag */
          loadingPages ? (
            <div className="px-3 py-6 text-center">
              <SpinnerIcon className="w-5 h-5 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">Carregando páginas…</p>
            </div>
          ) : pages.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <FileIcon className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">Nenhuma página com essa tag.</p>
            </div>
          ) : (
            <div className="animate-stagger">
              <div className="px-3 py-1 bg-muted/20 border-b border-border/50">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Páginas ({pages.length})
                </span>
              </div>
              {pages.map((p) => (
                <button
                  key={p.path}
                  onClick={() => void handleOpenPage(p.path)}
                  className="w-full text-left px-3 py-2 hover:bg-accent border-b border-border/50 transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    <FileIcon className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-foreground block truncate group-hover:text-primary transition-colors">
                        {p.title}
                      </span>
                      <span className="text-[10px] text-muted-foreground block mt-0.5 truncate">
                        {p.path}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
};

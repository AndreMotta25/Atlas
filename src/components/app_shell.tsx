import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileTree } from './sidebar/file_tree';
import { EditorPane } from './editor/editor_pane';
import { ChatPanel } from './chat/chat_panel';
import { SettingsModal } from './settings/settings_modal';
import { useVaultStore } from '../stores/vault_store';
import { useChatStore } from '../stores/chat_store';
import { useTheme } from '../hooks/use_theme';
import { api } from '../lib/api';

export interface CommentEntry {
  pos: number;
  text: string;
  comment: string;
}

const MIN_SIDEBAR = 180;
const MIN_CHAT = 260;

const ResizeHandle: React.FC<{ onStart: () => void }> = ({ onStart }) => (
  <div
    className="w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary shrink-0 transition-colors"
    onMouseDown={(e) => {
      e.preventDefault();
      onStart();
    }}
  />
);

export const AppShell: React.FC = () => {
  const loadTree = useVaultStore((s) => s.loadTree);
  const openPage = useVaultStore((s) => s.openPage);
  const subscribeWatch = useVaultStore((s) => s.subscribeWatch);
  const initChat = useChatStore((s) => s.init);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [chatWidth, setChatWidth] = useState(380);
  const [chatVisible, setChatVisible] = useState(true);

  const resizeRef = useRef<'sidebar' | 'chat' | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const deleteCommentRef = useRef<((index: number) => void) | null>(null);
  const updateCommentRef = useRef<((index: number, newComment: string) => void) | null>(null);

  // Comment coordination
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [commentIndex, setCommentIndex] = useState(0);
  const [chatTab, setChatTab] = useState<'chat' | 'comments'>('chat');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ path: string; reason: string }> | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useTheme();

  useEffect(() => {
    void loadTree();
    const unsubscribeWatch = subscribeWatch();
    const unsubscribeChat = initChat();
    return () => {
      unsubscribeWatch();
      unsubscribeChat();
    };
  }, [loadTree, subscribeWatch, initChat]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handle);
    return () => window.removeEventListener('mousedown', handle);
  }, [menuOpen]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!resizeRef.current) return;
    if (resizeRef.current === 'sidebar') {
      setSidebarWidth((w) => Math.max(MIN_SIDEBAR, w + e.movementX));
    } else {
      setChatWidth((w) => Math.max(MIN_CHAT, w - e.movementX));
    }
  }, []);

  const onMouseUp = useCallback(() => {
    resizeRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const handleNewPage = async () => {
    setMenuOpen(false);
    const base = 'sem-titulo';
    let n = 1;
    let rel = `${base}.md`;
    for (;;) {
      try {
        await api.vault.readPage(rel);
        n += 1;
        rel = `${base}-${n}.md`;
      } catch {
        break;
      }
    }
    await api.vault.writePage(rel, `# ${base}${n > 1 ? ' ' + n : ''}\n\n`);
    await loadTree();
    await openPage(rel);
  };

  const handleNewFolder = async () => {
    setMenuOpen(false);
    const base = 'nova-pasta';
    let n = 1;
    let rel = base;
    for (;;) {
      try {
        await api.vault.readPage(rel);
        n += 1;
        rel = `${base}-${n}`;
      } catch {
        break;
      }
    }
    await api.vault.createFolder(rel);
    await loadTree();
  };

  const handleCommentSelect = (index: number) => {
    setCommentIndex(index);
    setChatTab('comments');
  };

  const handleDeleteComment = (index: number) => {
    deleteCommentRef.current?.(index);
  };

  const handleUpdateComment = (index: number, newComment: string) => {
    updateCommentRef.current?.(index, newComment);
  };

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchResults(null);
    try {
      // FTS5 content search — instant and free (no LLM round-trip).
      const results = await api.vault.search(q);
      setSearchResults(results.map((r) => ({ path: r.path, reason: r.snippet })));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleOpenSearchResult = async (path: string) => {
    setSearchQuery('');
    setSearchResults(null);
    await openPage(path);
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <aside className="border-r border-border flex flex-col overflow-hidden" style={{ width: sidebarWidth, minWidth: MIN_SIDEBAR }}>
        {/* Sidebar header with search */}
        <div className="px-2 py-1.5 border-b border-border space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Vault
            </span>
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                title="Menu"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-card border border-border rounded-lg shadow-lg py-1 text-sm">
                  <button
                    onClick={handleNewPage}
                    className="w-full text-left px-3 py-1.5 hover:bg-accent flex items-center gap-2.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-muted-foreground shrink-0">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="12" y1="18" x2="12" y2="12" />
                      <line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                    Nova página
                  </button>
                  <button
                    onClick={handleNewFolder}
                    className="w-full text-left px-3 py-1.5 hover:bg-accent flex items-center gap-2.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-muted-foreground shrink-0">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      <line x1="12" y1="11" x2="12" y2="17" />
                      <line x1="9" y1="14" x2="15" y2="14" />
                    </svg>
                    Nova pasta
                  </button>
                  <div className="h-px bg-border my-1" />
                  <button
                    onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-accent flex items-center gap-2.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-muted-foreground shrink-0">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    Configurações
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!e.target.value.trim()) setSearchResults(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSearch();
                if (e.key === 'Escape') {
                  setSearchQuery('');
                  setSearchResults(null);
                }
              }}
              onFocus={() => {
                // Re-run search if results are empty and query exists
                if (searchQuery.trim() && searchResults?.length === 0) void handleSearch();
              }}
              placeholder="Pesquisar no vault…"
              className="w-full text-xs pl-7 pr-2 py-1.5 border border-input bg-card text-foreground rounded focus:outline-none focus:border-primary transition-colors"
            />
            {searching && (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin">
                <line x1="12" y1="2" x2="12" y2="6" />
                <line x1="12" y1="18" x2="12" y2="22" />
                <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                <line x1="2" y1="12" x2="6" y2="12" />
                <line x1="18" y1="12" x2="22" y2="12" />
                <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
              </svg>
            )}
            {searchQuery && !searching && (
              <button
                onClick={() => { setSearchQuery(''); setSearchResults(null); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Search results or file tree */}
        {searchResults !== null ? (
          <div className="flex-1 overflow-auto">
            {searchResults.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <p className="text-xs text-muted-foreground">Nenhum resultado encontrado.</p>
              </div>
            ) : (
              <div>
                <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                    Resultados ({searchResults.length})
                  </span>
                  <button
                    onClick={() => setSearchResults(null)}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Voltar
                  </button>
                </div>
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => void handleOpenSearchResult(r.path)}
                    className="w-full text-left px-3 py-2 hover:bg-accent border-b border-border/50 transition-colors group"
                  >
                    <div className="flex items-start gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-foreground block truncate group-hover:text-primary transition-colors">
                          {r.path}
                        </span>
                        <span className="text-[10px] text-muted-foreground block mt-0.5 line-clamp-2">
                          {r.reason}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <FileTree />
        )}
      </aside>

      <ResizeHandle onStart={() => { resizeRef.current = 'sidebar'; }} />

      <main className="overflow-hidden flex flex-col flex-1">
        <EditorPane
          onCommentsChange={setComments}
          onCommentSelect={handleCommentSelect}
          deleteCommentRef={deleteCommentRef}
          updateCommentRef={updateCommentRef}
          chatTab={chatTab}
          onSetTab={setChatTab}
          commentCount={comments.length}
        />
      </main>

      {chatVisible && <ResizeHandle onStart={() => { resizeRef.current = 'chat'; }} />}

      {chatVisible ? (
        <aside className="border-l border-border overflow-hidden" style={{ width: chatWidth, minWidth: MIN_CHAT }}>
          <ChatPanel
            chatTab={chatTab}
            onSetTab={setChatTab}
            comments={comments}
            commentIndex={commentIndex}
            onCommentIndexChange={setCommentIndex}
            onDeleteComment={handleDeleteComment}
            onUpdateComment={handleUpdateComment}
            onToggleChat={() => setChatVisible(false)}
          />
        </aside>
      ) : (
        <button
          onClick={() => setChatVisible(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:brightness-110 active:scale-95 transition-all duration-200 flex items-center justify-center group"
          title="Abrir Atlas"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          {/* Notification dot if there are messages */}
          {useChatStore.getState().messages.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full flex items-center justify-center text-[9px] font-bold text-primary-foreground shadow">
              {useChatStore.getState().messages.filter(m => m.role === 'assistant').length}
            </span>
          )}
        </button>
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
};

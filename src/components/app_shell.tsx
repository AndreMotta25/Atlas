import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileTree } from './sidebar/file_tree';
import { EditorPane } from './editor/editor_pane';
import { ChatPanel } from './chat/chat_panel';
import { SettingsModal } from './settings/settings_modal';
import { useVaultStore } from '../stores/vault_store';
import { useChatStore } from '../stores/chat_store';
import { useTheme } from '../hooks/use_theme';
import { useFont } from '../hooks/use_font';
import { api } from '../lib/api';
import type { ChatSearchResult } from '../types';
import {
  MenuHamburger, SearchIcon, SpinnerIcon, CloseIcon, FileIcon, FolderPlus,
  GearIcon, ChevronDown, ChatIcon, SearchEmptyIcon, ClockIcon, SuccessIcon,
  ChevronLeft, ChevronRight,
} from './icons';

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
  const [vaultVisible, setVaultVisible] = useState(true);

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
  const [pageResults, setPageResults] = useState<Array<{ path: string; reason: string }> | null>(null);
  const [chatResults, setChatResults] = useState<ChatSearchResult[] | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useTheme();
  useFont();

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
    setPageResults(null);
    setChatResults(null);
    try {
      // Run both FTS5 searches in parallel — pages + chat messages.
      const [pages, messages] = await Promise.all([
        api.vault.search(q).catch((): Awaited<ReturnType<typeof api.vault.search>> => []),
        api.chat.searchMessages(q).catch((): Awaited<ReturnType<typeof api.chat.searchMessages>> => []),
      ]);
      setPageResults(pages.map((r) => ({ path: r.path, reason: r.snippet })));
      setChatResults(messages);
    } catch {
      setPageResults([]);
      setChatResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleOpenSearchResult = async (path: string) => {
    clearSearch();
    await openPage(path);
  };

  const handleOpenChatResult = async (sessionId: string) => {
    clearSearch();
    setChatTab('chat');
    await useChatStore.getState().loadConversation(sessionId);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setPageResults(null);
    setChatResults(null);
  };

  const hasResults =
    (pageResults !== null && pageResults.length > 0) ||
    (chatResults !== null && chatResults.length > 0);
  const showingResults = pageResults !== null || chatResults !== null;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {vaultVisible ? (
        <aside className="border-r border-border flex flex-col overflow-hidden" style={{ width: sidebarWidth, minWidth: MIN_SIDEBAR }}>
          {/* Sidebar header with search */}
          <div className="px-2 py-1.5 border-b border-border space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Vault
                </span>
                <button
                  onClick={() => setVaultVisible(false)}
                  className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                  title="Fechar vault"
                  aria-label="Fechar vault"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
              <div ref={menuRef} className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                  title="Menu"
                  aria-label="Menu"
                >
                  <MenuHamburger />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-card border border-border rounded-lg shadow-lg py-1 text-sm animate-scale-in">
                    <button
                      onClick={handleNewPage}
                      className="w-full text-left px-3 py-1.5 hover:bg-accent flex items-center gap-2.5"
                    >
                      <FileIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      Nova página
                    </button>
                    <button
                      onClick={handleNewFolder}
                      className="w-full text-left px-3 py-1.5 hover:bg-accent flex items-center gap-2.5"
                    >
                      <FolderPlus className="w-4 h-4 text-muted-foreground shrink-0" />
                      Nova pasta
                    </button>
                    <div className="h-px bg-border my-1" />
                    <button
                      onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-accent flex items-center gap-2.5"
                    >
                      <GearIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      Configurações
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Search bar */}
            <div className="relative">
              <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (!e.target.value.trim()) {
                    setPageResults(null);
                    setChatResults(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSearch();
                  if (e.key === 'Escape') clearSearch();
                }}
                onFocus={() => {
                  // Re-run search if results are empty and query exists
                  if (searchQuery.trim() && !hasResults) void handleSearch();
                }}
                placeholder="Pesquisar no vault…"
                className="w-full text-xs pl-7 pr-2 py-1.5 border border-input bg-card text-foreground rounded focus:outline-none focus:border-primary transition-colors"
              />
              {searching && (
                <SpinnerIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              )}
              {searchQuery && !searching && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CloseIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Search results or file tree */}
          {showingResults ? (
            <div className="flex-1 overflow-auto">
              {!hasResults ? (
                <div className="px-3 py-6 text-center">
                  <SearchEmptyIcon className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhum resultado encontrado.</p>
                </div>
              ) : (
                <>
                  <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                      Resultados
                    </span>
                    <button
                      onClick={clearSearch}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Voltar
                    </button>
                  </div>

                  {/* Pages section */}
                  {pageResults && pageResults.length > 0 && (
                    <div className="animate-stagger">
                      <div className="px-3 py-1 bg-muted/20 border-b border-border/50">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                          Páginas ({pageResults.length})
                        </span>
                      </div>
                      {pageResults.map((r, i) => (
                        <button
                          key={`p${i}`}
                          onClick={() => void handleOpenSearchResult(r.path)}
                          className="w-full text-left px-3 py-2 hover:bg-accent border-b border-border/50 transition-colors group"
                        >
                          <div className="flex items-start gap-2">
                            <FileIcon className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
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

                  {/* Chat messages section */}
                  {chatResults && chatResults.length > 0 && (
                    <div className="animate-stagger">
                      <div className="px-3 py-1 bg-muted/20 border-b border-border/50">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                          Conversas ({chatResults.length})
                        </span>
                      </div>
                      {chatResults.map((r, i) => (
                        <button
                          key={`c${i}`}
                          onClick={() => void handleOpenChatResult(r.sessionId)}
                          className="w-full text-left px-3 py-2 hover:bg-accent border-b border-border/50 transition-colors group"
                        >
                          <div className="flex items-start gap-2">
                            <ChatIcon className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <span className="text-xs font-medium text-foreground block truncate group-hover:text-primary transition-colors italic">
                                {r.sessionTitle ?? 'Sem título'}
                              </span>
                              <span className="text-[10px] text-muted-foreground block mt-0.5 line-clamp-2">
                                {r.snippet}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <FileTree />
          )}
        </aside>
      ) : (
        <button
          onClick={() => setVaultVisible(true)}
          className="border-r border-border flex items-center justify-center w-7 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
          title="Abrir vault"
          aria-label="Abrir vault"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}

      {vaultVisible && <ResizeHandle onStart={() => { resizeRef.current = 'sidebar'; }} />}

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
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:brightness-110 btn-press flex items-center justify-center group"
          title="Abrir Atlas"
          aria-label="Abrir chat do Atlas"
        >
          <ClockIcon className="w-6 h-6" />
          {/* Notification dot if there are messages */}
          {useChatStore.getState().messages.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full flex items-center justify-center text-[9px] font-bold text-primary-foreground shadow animate-scale-in">
              {useChatStore.getState().messages.filter(m => m.role === 'assistant').length}
            </span>
          )}
        </button>
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
};

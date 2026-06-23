import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileTree } from './sidebar/file_tree';
import { ActivityBar } from './sidebar/activity_bar';
import type { ActivityId } from './sidebar/activity_bar';
import { TagsPanel } from './sidebar/tags_panel';
import { BacklinksPanel } from './sidebar/backlinks_panel';
import { EditorPane } from './editor/editor_pane';
import { ChatPanel } from './chat/chat_panel';
import { SettingsModal } from './settings/settings_modal';
import { HomeView } from './home/home_view';
import { GraphView } from './graph/graph_view';
import { useVaultStore } from '../stores/vault_store';
import { useChatStore } from '../stores/chat_store';
import { useTheme } from '../hooks/use_theme';
import { useFont } from '../hooks/use_font';
import { api } from '../lib/api';
import { createNewPage, createNewFolder } from '../lib/vault_utils';
import {
  SearchIcon, SpinnerIcon, CloseIcon, FileIcon, FolderPlus, PlusIcon,
  GearIcon, SearchEmptyIcon, ClockIcon, SuccessIcon, AtlasActivityIcon, ChatIcon,
  LinkIcon, ChevronLeft, ChevronRight,
} from './icons';

import type { ChatSession } from '../types';
import type { CommentEntry } from './editor/comment_parser';
export type { CommentEntry };

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
  const sessions = useChatStore((s) => s.sessions);
  const activeSession = useChatStore((s) => s.activeSession);
  const newConversation = useChatStore((s) => s.newConversation);
  const loadConversation = useChatStore((s) => s.loadConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const setSessionPagePath = useChatStore((s) => s.setSessionPagePath);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [chatWidth, setChatWidth] = useState(380);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [activeActivity, setActiveActivity] = useState<ActivityId>('projects');

  const resizeRef = useRef<'sidebar' | 'chat' | null>(null);
  const deleteCommentRef = useRef<((index: number) => void) | null>(null);
  const updateCommentRef = useRef<((index: number, newComment: string) => void) | null>(null);
  const scrollToCommentRef = useRef<((index: number) => void) | null>(null);

  // Comment coordination
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [commentIndex, setCommentIndex] = useState(0);
  const [chatTab, setChatTab] = useState<'chat' | 'comments'>('chat');

  // Chat display mode: 'panel' = side panel, 'bubble' = minimized ball,
  // 'overlay' = detached full-screen modal floating over the editor.
  type ChatMode = 'panel' | 'bubble' | 'overlay';
  const [chatMode, setChatMode] = useState<ChatMode>('panel');

  // Whether the Home view is shown instead of the editor.
  const currentPath = useVaultStore((s) => s.currentPath);
  const [viewingHome, setViewingHome] = useState(true);
  // Graph view takes over the main canvas (same priority as Home).
  const [viewingGraph, setViewingGraph] = useState(false);

  // Opening any page leaves the Home view.
  useEffect(() => {
    if (currentPath !== null) setViewingHome(false);
  }, [currentPath]);

  // Entering the editor also leaves the Graph view.
  useEffect(() => {
    if (currentPath !== null) setViewingGraph(false);
  }, [currentPath]);

  // Keep the active chat session in sync with the editor's currentPath.
  // When the user navigates to a different page, rebind the session to it
  // (or unbind if they go to Home) and rewire the AI's per-turn context.
  useEffect(() => {
    void useChatStore.getState().reactToNavigation(currentPath);
  }, [currentPath]);

  // Overlay drag position (offset from top-left of the viewport).
  const [overlayPos, setOverlayPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Close the overlay with Esc.
  useEffect(() => {
    if (chatMode !== 'overlay') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChatMode('panel');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chatMode]);

  // Drag handlers for the floating overlay.
  const onDragStart = (e: React.MouseEvent) => {
    // Only start drag from left mouse button.
    if (e.button !== 0) return;
    const start = overlayPos ?? { x: 0, y: 0 };
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: start.x, origY: start.y };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      setOverlayPos({ x: d.origX + dx, y: d.origY + dy });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [pageResults, setPageResults] = useState<Array<{ path: string; reason: string }> | null>(null);
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

  const handleNewPage: () => void = () => void createNewPage();

  const handleNewFolder: () => void = () => void createNewFolder();

  const handleCommentSelect = (index: number) => {
    setCommentIndex(index);
    setChatTab('comments');
    scrollToCommentRef.current?.(index);
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
    try {
      const pages = await api.vault.search(q).catch((): Awaited<ReturnType<typeof api.vault.search>> => []);
      setPageResults(pages.map((r) => ({ path: r.path, reason: r.snippet })));
    } catch {
      setPageResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleOpenSearchResult = async (path: string) => {
    clearSearch();
    await openPage(path);
  };

  const handleActivityChange = (id: ActivityId) => {
    if (id === 'settings') {
      setSettingsOpen(true);
      return;
    }
    if (id === 'graph') {
      // Graph view takes over the main canvas — sidebar not used.
      setActiveActivity(id);
      setViewingGraph(true);
      setViewingHome(false);
      setSidebarVisible(false);
      return;
    }
    // Any other activity leaves graph mode.
    if (viewingGraph) setViewingGraph(false);
    if (id === activeActivity) {
      // Toggle sidebar off when clicking the active icon (VS Code behavior)
      setSidebarVisible((v) => !v);
    } else {
      setActiveActivity(id);
      setSidebarVisible(true);
      // Focus search input when switching to search activity
      if (id === 'search') {
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setPageResults(null);
  };

  const hasResults = pageResults !== null && pageResults.length > 0;
  const showingResults = pageResults !== null;

  const renderActivityView = () => {
    switch (activeActivity) {
      case 'projects':
        return (
          <>
            {/* Sidebar header */}
            <div className="px-2 py-1.5 border-b border-border space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Projetos
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={handleNewPage}
                    className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                    title="Nova página"
                    aria-label="Nova página"
                  >
                    <PlusIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleNewFolder}
                    className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                    title="Nova pasta"
                    aria-label="Nova pasta"
                  >
                    <FolderPlus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSidebarVisible(false)}
                    className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                    title="Fechar painel"
                    aria-label="Fechar painel"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
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
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSearch();
                    if (e.key === 'Escape') clearSearch();
                  }}
                  onFocus={() => {
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

                  </>
                )}
              </div>
            ) : (
              <FileTree />
            )}
          </>
        );

      case 'search':
        return (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-2 py-1.5 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pesquisar
              </span>
              <button
                onClick={() => setSidebarVisible(false)}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                title="Fechar painel"
                aria-label="Fechar painel"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-2 space-y-2">
              <div className="relative">
                <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (!e.target.value.trim()) {
                      setPageResults(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSearch();
                    if (e.key === 'Escape') clearSearch();
                  }}
                  placeholder="Pesquisar páginas…"
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
            <div className="flex-1 overflow-auto">
              {!hasResults && !searchQuery && (
                <div className="px-3 py-6 text-center">
                  <SearchEmptyIcon className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">Digite para pesquisar no vault.</p>
                </div>
              )}
              {!hasResults && searchQuery && (
                <div className="px-3 py-6 text-center">
                  <SearchEmptyIcon className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhum resultado encontrado.</p>
                </div>
              )}
              {hasResults && (
                <div className="animate-stagger">
                  {pageResults && pageResults.length > 0 && (
                    <>
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
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );

      case 'tags':
        return (
          <TagsPanel onBack={() => setSidebarVisible(false)} />
        );

      case 'backlinks':
        return (
          <BacklinksPanel onBack={() => setSidebarVisible(false)} />
        );

      case 'settings':
        return (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-2 py-1.5 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Configurações
              </span>
              <button
                onClick={() => setSidebarVisible(false)}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                title="Fechar painel"
                aria-label="Fechar painel"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center p-4 gap-3">
              <GearIcon className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground text-center">
                Preferências do editor, tema e provedor de IA.
              </p>
              <button
                onClick={() => setSettingsOpen(true)}
                className="px-4 py-1.5 text-xs bg-primary text-primary-foreground hover:brightness-90 rounded-lg font-medium transition-all"
              >
                Abrir configurações
              </button>
            </div>
          </div>
        );

      case 'atlas':
        return (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-2 py-1.5 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Atlas
              </span>
              <button
                onClick={() => setSidebarVisible(false)}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                title="Fechar painel"
                aria-label="Fechar painel"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              {/* New conversation button */}
              <div className="p-2">
                <button
                  onClick={async () => {
                    await newConversation();
                    setViewingHome(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs bg-primary text-primary-foreground hover:brightness-90 rounded-lg font-medium transition-all"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  Nova conversa
                </button>
              </div>

              {/* Active conversation indicator */}
              {activeSession && (
                <div className="px-3 py-1.5 border-y border-border bg-muted/20">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
                    Conversa ativa
                  </p>
                  <button
                    onClick={() => setViewingHome(true)}
                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent text-foreground transition-colors truncate flex items-center gap-2"
                    title={activeSession.title ?? 'Sem título'}
                  >
                    <ChatIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="truncate">{activeSession.title ?? 'Sem título'}</span>
                  </button>
                  {activeSession.pagePath && (() => {
                    const boundPath = activeSession.pagePath;
                    return (
                    <div className="mt-1.5 flex items-center gap-1 px-2 py-1 rounded bg-primary/10 border border-primary/20 text-[11px]">
                      <LinkIcon className="w-3 h-3 text-primary shrink-0" />
                      <span
                        className="flex-1 truncate text-foreground/80"
                        title={`Vinculada a ${boundPath}`}
                      >
                        {boundPath}
                      </span>
                      <button
                        onClick={() => void openPage(boundPath)}
                        className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        title="Abrir página no editor"
                        aria-label="Abrir página vinculada no editor"
                      >
                        <FileIcon className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => void setSessionPagePath(activeSession.id, null)}
                        className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Desvincular desta página"
                        aria-label="Desvincular conversa desta página"
                      >
                        <CloseIcon className="w-3 h-3" />
                      </button>
                    </div>
                    );
                  })()}
                </div>
              )}

              {/* Recent conversations */}
              <div className="px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">
                  Conversas recentes
                </p>
                {sessions.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/60 italic">
                    Nenhuma conversa ainda.
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {sessions.map((s: ChatSession) => (
                      <div
                        key={s.id}
                        className="group flex items-center gap-2"
                      >
                        <button
                          onClick={async () => {
                            await loadConversation(s.id);
                            setViewingHome(true);
                          }}
                          className="flex-1 flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors min-w-0"
                          title={s.pagePath ? `${s.title ?? 'Sem título'} — vinculada a ${s.pagePath}` : (s.title ?? 'Sem título')}
                        >
                          <ChatIcon className="w-3 h-3 shrink-0" />
                          {s.pagePath && (
                            <LinkIcon
                              className="w-2.5 h-2.5 shrink-0 text-primary"
                              aria-label={`Vinculada a ${s.pagePath}`}
                            />
                          )}
                          <span className="truncate">{s.title ?? 'Sem título'}</span>
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await deleteConversation(s.id);
                          }}
                          className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                          title="Excluir conversa"
                          aria-label="Excluir conversa"
                        >
                          <CloseIcon className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer hint */}
            <div className="shrink-0 px-3 py-2 border-t border-border">
              <p className="text-[10px] text-muted-foreground/60 text-center">
                Pressione Enter para enviar, Shift+Enter para nova linha
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Activity bar — always visible (VS Code style) */}
      <ActivityBar
        active={activeActivity}
        onChange={handleActivityChange}
        homeActive={viewingHome}
        onHome={() => {
          setViewingHome(true);
          setViewingGraph(false);
          // Close the currently open page so it isn't "in memory" while on Home:
          // unhighlights the sidebar row, unbinds the chat session via
          // reactToNavigation(null), and clears any dirty editor buffer.
          useVaultStore.setState({ currentPath: null, currentContent: '', dirty: false });
          // Clear conversation view without tearing down IPC listeners
          // (reset() would unsubscribe ai:token and break the next stream).
          useChatStore.setState({
            messages: [],
            streaming: false,
            activeSession: null,
            activeRequestId: null,
            error: null,
          });
        }}
      />

      {sidebarVisible ? (
        <aside className="border-r border-border flex flex-col overflow-hidden" style={{ width: sidebarWidth, minWidth: MIN_SIDEBAR }}>
          {renderActivityView()}
        </aside>
      ) : null}

      {sidebarVisible && <ResizeHandle onStart={() => { resizeRef.current = 'sidebar'; }} />}

      <main className="overflow-hidden flex flex-col flex-1">
        {/* EditorPane is always mounted to avoid destroying/recreating the
            CodeMirror EditorView on every Home ↔ Editor navigation.
            Recreating the editor right after HomeView (which holds a focused
            textarea) unmounts triggers a Chromium hit-testing bug where the
            new contenteditable doesn't respond to clicks until a window
            resize/visibility change forces a reflow. */}
        <div className={viewingGraph || viewingHome ? 'hidden' : 'flex flex-col h-full'}>
          <EditorPane
            onCommentsChange={setComments}
            onCommentSelect={handleCommentSelect}
            deleteCommentRef={deleteCommentRef}
            updateCommentRef={updateCommentRef}
            scrollToCommentRef={scrollToCommentRef}
            chatTab={chatTab}
            onSetTab={setChatTab}
            commentCount={comments.length}
          />
        </div>
        {viewingGraph && <GraphView />}
        {viewingHome && <HomeView />}
      </main>

      {chatMode === 'panel' && !viewingHome && !viewingGraph && <ResizeHandle onStart={() => { resizeRef.current = 'chat'; }} />}

      {chatMode === 'panel' && !viewingHome && !viewingGraph ? (
        <aside className="border-l border-border overflow-hidden" style={{ width: chatWidth, minWidth: MIN_CHAT }}>
          <ChatPanel
            chatTab={chatTab}
            onSetTab={setChatTab}
            comments={comments}
            commentIndex={commentIndex}
            onCommentIndexChange={setCommentIndex}
            onDeleteComment={handleDeleteComment}
            onUpdateComment={handleUpdateComment}
            onToggleChat={() => setChatMode('bubble')}
            onDetach={() => setChatMode('overlay')}
          />
        </aside>
      ) : chatMode === 'bubble' ? (
        <button
          onClick={() => setChatMode('panel')}
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
      ) : null}

      {chatMode === 'overlay' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/50 backdrop-blur-sm animate-scale-in"
          onClick={() => setChatMode('panel')}
        >
          <div
            className="relative w-full max-w-3xl h-[85vh] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={overlayPos ? { transform: `translate(${overlayPos.x}px, ${overlayPos.y}px)` } : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div
              onMouseDown={onDragStart}
              className="shrink-0 h-7 flex items-center justify-center cursor-grab active:cursor-grabbing border-b border-border bg-muted/30 hover:bg-muted/50 transition-colors"
              title="Arraste para mover"
            >
              <div className="w-10 h-1 rounded-full bg-muted-foreground/40" />
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatPanel
                chatTab={chatTab}
                onSetTab={setChatTab}
                comments={comments}
                commentIndex={commentIndex}
                onCommentIndexChange={setCommentIndex}
                onDeleteComment={handleDeleteComment}
                onUpdateComment={handleUpdateComment}
                onToggleChat={() => setChatMode('panel')}
                showInput
              />
            </div>
          </div>
        </div>
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
};

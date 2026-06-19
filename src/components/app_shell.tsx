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

  const resizeRef = useRef<'sidebar' | 'chat' | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const deleteCommentRef = useRef<((index: number) => void) | null>(null);
  const updateCommentRef = useRef<((index: number, newComment: string) => void) | null>(null);

  // Comment coordination
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [commentIndex, setCommentIndex] = useState(0);
  const [chatTab, setChatTab] = useState<'chat' | 'comments'>('chat');

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

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <aside className="border-r border-border flex flex-col overflow-hidden" style={{ width: sidebarWidth, minWidth: MIN_SIDEBAR }}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
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
        <FileTree />
      </aside>

      <ResizeHandle onStart={() => { resizeRef.current = 'sidebar'; }} />

      <main className="overflow-hidden flex flex-col flex-1">
        <EditorPane
          onCommentsChange={setComments}
          onCommentSelect={handleCommentSelect}
          deleteCommentRef={deleteCommentRef}
          updateCommentRef={updateCommentRef}
        />
      </main>

      <ResizeHandle onStart={() => { resizeRef.current = 'chat'; }} />

      <aside className="border-l border-border overflow-hidden" style={{ width: chatWidth, minWidth: MIN_CHAT }}>
        <ChatPanel
          chatTab={chatTab}
          onSetTab={setChatTab}
          comments={comments}
          commentIndex={commentIndex}
          onCommentIndexChange={setCommentIndex}
          onDeleteComment={handleDeleteComment}
          onUpdateComment={handleUpdateComment}
        />
      </aside>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
};

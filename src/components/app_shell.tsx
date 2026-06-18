import React, { useEffect, useState } from 'react';
import { FileTree } from './sidebar/file_tree';
import { EditorPane } from './editor/editor_pane';
import { ChatPanel } from './chat/chat_panel';
import { SettingsModal } from './settings/settings_modal';
import { useVaultStore } from '../stores/vault_store';
import { useChatStore } from '../stores/chat_store';
import { useTheme } from '../hooks/use_theme';

export const AppShell: React.FC = () => {
  const loadTree = useVaultStore((s) => s.loadTree);
  const subscribeWatch = useVaultStore((s) => s.subscribeWatch);
  const initChat = useChatStore((s) => s.init);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  return (
    <div className="grid grid-cols-[260px_1fr_380px] h-screen bg-background text-foreground overflow-hidden">
      <aside className="border-r border-border flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Vault
          </span>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-muted-foreground hover:text-foreground text-sm"
            title="Configurações"
          >
            ⚙
          </button>
        </div>
        <FileTree />
      </aside>

      <main className="overflow-hidden flex flex-col">
        <EditorPane />
      </main>

      <aside className="border-l border-border overflow-hidden">
        <ChatPanel />
      </aside>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
};

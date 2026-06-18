import React, { useEffect, useState } from 'react';
import { FileTree } from './sidebar/file_tree';
import { EditorPane } from './editor/editor_pane';
import { ChatPanel } from './chat/chat_panel';
import { SettingsModal } from './settings/settings_modal';
import { useVaultStore } from '../stores/vault_store';
import { useChatStore } from '../stores/chat_store';

export const AppShell: React.FC = () => {
  const loadTree = useVaultStore((s) => s.loadTree);
  const subscribeWatch = useVaultStore((s) => s.subscribeWatch);
  const initChat = useChatStore((s) => s.init);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    <div className="grid grid-cols-[260px_1fr_380px] h-screen bg-white text-slate-900 overflow-hidden">
      <aside className="border-r border-slate-200 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Vault
          </span>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-slate-500 hover:text-slate-800 text-sm"
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

      <aside className="border-l border-slate-200 overflow-hidden">
        <ChatPanel />
      </aside>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
};

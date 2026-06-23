import React from 'react';
import { useChatStore } from '../stores/chat_store';
import { useSettingsStore } from '../stores/settings_store';
import { useVaultStore } from '../stores/vault_store';
import { LinkIcon, UnlinkIcon } from './icons';

interface AutoBindToggleProps {
  variant?: 'full' | 'compact';
  showLabel?: boolean;
}

export const AutoBindToggle: React.FC<AutoBindToggleProps> = ({
  variant = 'full',
  showLabel = true,
}) => {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const currentPath = useVaultStore((s) => s.currentPath);

  const enabled = settings.autoBindChatToPage;

  const handleToggle = async () => {
    const next = !enabled;
    await update({ autoBindChatToPage: next });
    if (next) {
      void useChatStore.getState().reactToNavigation(currentPath);
    } else {
      const { activeSession, contextPages } = useChatStore.getState();
      if (activeSession && activeSession.pagePath !== null) {
        await useChatStore.getState().setSessionPagePath(activeSession.id, null);
        if (contextPages.length > 0) {
          useChatStore.setState({ contextPages: [] });
        }
      }
    }
  };

  if (variant === 'compact') {
    return (
      <button
        onClick={() => void handleToggle()}
        title={enabled ? 'Vinculação automática ativa' : 'Vinculação automática desativada'}
        aria-label={enabled ? 'Desativar vinculação automática' : 'Ativar vinculação automática'}
        aria-pressed={enabled}
        className={`p-1 rounded transition-colors ${
          enabled
            ? 'bg-primary/15 text-primary hover:bg-primary/25'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        {enabled ? (
          <LinkIcon className="w-3.5 h-3.5" />
        ) : (
          <UnlinkIcon className="w-3.5 h-3.5" />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={() => void handleToggle()}
      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
        enabled
          ? 'border-primary/40 bg-primary/10 text-foreground'
          : 'border-border bg-muted/30 text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {enabled ? <LinkIcon className="w-4 h-4 shrink-0" /> : <UnlinkIcon className="w-4 h-4 shrink-0" />}
        {showLabel && (
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">Vincular à página atual</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {enabled
                ? 'Novas conversas são abertas no contexto da página ativa'
                : 'Conversas são globais — sem vínculo com a página'}
            </div>
          </div>
        )}
      </div>
      <span
        className={`shrink-0 w-9 h-5 rounded-full relative transition-colors ${
          enabled ? 'bg-primary' : 'bg-muted-foreground/30'
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
};

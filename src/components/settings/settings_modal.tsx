import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useSettingsStore } from '../../stores/settings_store';
import { useVaultStore } from '../../stores/vault_store';
import { useTheme } from '../../hooks/use_theme';
import type { AIProvider, ThemeMode } from '../../types';

interface SettingsModalProps {
  onClose: () => void;
}

const PROVIDERS: { id: AIProvider; label: string; modelPlaceholder: string }[] = [
  { id: 'deepseek', label: 'DeepSeek', modelPlaceholder: 'deepseek-chat' },
  { id: 'openai', label: 'OpenAI', modelPlaceholder: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic', modelPlaceholder: 'claude-3-5-sonnet' },
  { id: 'ollama', label: 'Ollama', modelPlaceholder: 'llama3.1' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const setApiKey = useSettingsStore((s) => s.setApiKey);
  const deleteApiKey = useSettingsStore((s) => s.deleteApiKey);
  const loadSettings = useSettingsStore((s) => s.load);
  const loadTree = useVaultStore((s) => s.loadTree);

  const { setTheme } = useTheme();

  const [keyDraft, setKeyDraft] = useState('');
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Probe current key status for the active provider on mount.
  useEffect(() => {
    void api.settings.hasApiKey(settings.activeProvider).then(setHasKey);
  }, [settings.activeProvider]);

  const refreshKeyStatus = async () => {
    const has = await api.settings.hasApiKey(settings.activeProvider);
    setHasKey(has);
  };

  const handleProviderChange = async (provider: AIProvider) => {
    await update({ activeProvider: provider });
    await refreshKeyStatus();
    setKeyDraft('');
  };

  const handleModelChange = async (model: string) => {
    await update({ defaultModel: model });
  };

  const handleSaveKey = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    if (!keyDraft.trim()) {
      setErrorMsg('Cole uma API key válida.');
      return;
    }
    const ok = await setApiKey(settings.activeProvider, keyDraft.trim());
    if (ok) {
      setStatusMsg('API key salva com segurança (safeStorage).');
      setKeyDraft('');
      await refreshKeyStatus();
    } else {
      setErrorMsg('Falha ao salvar — criptografia indisponível neste sistema.');
    }
  };

  const handleDeleteKey = async () => {
    await deleteApiKey(settings.activeProvider);
    await refreshKeyStatus();
    setStatusMsg('API key removida.');
  };

  const handleChangeVault = async () => {
    const status = await api.vault.select();
    if (status.configured) {
      await loadSettings();
      await loadTree();
    }
  };

  const THEME_OPTIONS: { id: ThemeMode; label: string }[] = [
    { id: 'light', label: 'Claro' },
    { id: 'dark', label: 'Escuro' },
    { id: 'system', label: 'Sistema' },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-xl dark:shadow-2xl w-full max-w-lg max-h-[80vh] overflow-auto">
        <header className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Configurações</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="p-5 space-y-5">
          {/* Vault */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-1">Vault</h3>
            <p className="text-xs text-muted-foreground mb-2 truncate">
              {settings.vaultPath ?? '— nenhum —'}
            </p>
            <button
              onClick={handleChangeVault}
              className="px-3 py-1 bg-muted hover:bg-accent rounded text-sm text-foreground"
            >
              Trocar vault
            </button>
          </section>

          {/* Tema */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2">Tema</h3>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => void setTheme(opt.id)}
                  className={`px-3 py-2 rounded text-sm border ${
                    settings.themeMode === opt.id
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-border hover:bg-accent text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          {/* Provider */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-1">Provider ativo</h3>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => void handleProviderChange(p.id)}
                  className={`px-3 py-2 rounded text-sm border ${
                    settings.activeProvider === p.id
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-border hover:bg-accent text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Apenas DeepSeek está ativo no MVP. Os demais providers entram na Fase 4.
            </p>
          </section>

          {/* Model */}
          <section>
            <label className="block text-sm font-semibold text-foreground mb-1">
              Modelo padrão
            </label>
            <input
              type="text"
              value={settings.defaultModel}
              onChange={(e) => void handleModelChange(e.target.value)}
              placeholder={
                PROVIDERS.find((p) => p.id === settings.activeProvider)?.modelPlaceholder
              }
              className="w-full text-sm px-2 py-1 border border-input bg-card text-foreground rounded"
            />
          </section>

          {/* API Key */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              API Key — {settings.activeProvider}
            </h3>
            <p className="text-xs text-muted-foreground mb-2">
              {hasKey === null
                ? 'verificando…'
                : hasKey
                ? <span className="flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-success"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg> já configurada (criptografada com safeStorage).</span>
                : <span className="flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-warning"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg> nenhuma key configurada.</span>}
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="Cole aqui a API key"
                className="flex-1 text-sm px-2 py-1 border border-input bg-card text-foreground rounded"
              />
              <button
                onClick={handleSaveKey}
                className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm hover:brightness-90"
              >
                Salvar
              </button>
              {hasKey && (
                <button
                  onClick={handleDeleteKey}
                  className="px-3 py-1 bg-destructive/20 text-destructive rounded text-sm hover:bg-destructive/30"
                >
                  Remover
                </button>
              )}
            </div>
            {statusMsg && <p className="text-xs text-success mt-2">{statusMsg}</p>}
            {errorMsg && <p className="text-xs text-destructive mt-2">{errorMsg}</p>}
          </section>
        </div>

        <footer className="px-5 py-3 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1 bg-muted text-foreground rounded text-sm hover:bg-accent"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
};

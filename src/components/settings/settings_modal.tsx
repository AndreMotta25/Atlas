import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api';
import { useSettingsStore } from '../../stores/settings_store';
import { useVaultStore } from '../../stores/vault_store';
import { useTheme } from '../../hooks/use_theme';
import type { AIProvider, ThemeMode } from '../../types';
import { CloseIcon, SuccessIcon, WarningIcon } from '../icons';

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
  const [tavilyKeyDraft, setTavilyKeyDraft] = useState('');
  const [hasTavilyKey, setHasTavilyKey] = useState<boolean | null>(null);
  const [tavilyStatusMsg, setTavilyStatusMsg] = useState<string | null>(null);
  const [tavilyErrorMsg, setTavilyErrorMsg] = useState<string | null>(null);
  const [confirmVault, setConfirmVault] = useState(false);
  const [promptDraft, setPromptDraft] = useState(settings.systemPrompt ?? '');
  const [defaultPrompt, setDefaultPrompt] = useState<string | null>(null);
  const [promptSaved, setPromptSaved] = useState(false);

  // Model list fetched from the provider's /models endpoint.
  const [modelList, setModelList] = useState<string[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Probe current key status for the active provider on mount.
  useEffect(() => {
    void api.settings.hasApiKey(settings.activeProvider).then(setHasKey);
  }, [settings.activeProvider]);

  // Fetch the provider's model list whenever the provider or key status changes.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (hasKey !== true) {
        setModelList(null);
        setModelsError(null);
        return;
      }
      setModelsLoading(true);
      setModelsError(null);
      try {
        const result = await api.settings.listModels(settings.activeProvider);
        if (cancelled) return;
        setModelList(result.models);
        setModelsError(result.error ?? null);
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [settings.activeProvider, hasKey]);

  // Probe Tavily key status on mount.
  useEffect(() => {
    void api.settings.hasApiKey('tavily').then(setHasTavilyKey);
  }, []);

  // Load default prompt for placeholder display.
  useEffect(() => {
    void api.settings.getDefaultPrompt().then(setDefaultPrompt);
  }, []);

  // Sync draft when settings.systemPrompt changes externally.
  useEffect(() => {
    setPromptDraft(settings.systemPrompt ?? '');
  }, [settings.systemPrompt]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

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

  const handleSavePrompt = async () => {
    const trimmed = promptDraft.trim();
    await update({ systemPrompt: trimmed || undefined });
    setPromptSaved(true);
    setTimeout(() => setPromptSaved(false), 2000);
  };

  const handleResetPrompt = async () => {
    setPromptDraft('');
    await update({ systemPrompt: undefined });
    setPromptSaved(true);
    setTimeout(() => setPromptSaved(false), 2000);
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

  const refreshTavilyKeyStatus = async () => {
    const has = await api.settings.hasApiKey('tavily');
    setHasTavilyKey(has);
  };

  const handleSaveTavilyKey = async () => {
    setTavilyErrorMsg(null);
    setTavilyStatusMsg(null);
    if (!tavilyKeyDraft.trim()) {
      setTavilyErrorMsg('Cole uma API key válida.');
      return;
    }
    const ok = await setApiKey('tavily', tavilyKeyDraft.trim());
    if (ok) {
      setTavilyStatusMsg('Tavily key salva com segurança (safeStorage).');
      setTavilyKeyDraft('');
      await refreshTavilyKeyStatus();
    } else {
      setTavilyErrorMsg('Falha ao salvar — criptografia indisponível neste sistema.');
    }
  };

  const handleDeleteTavilyKey = async () => {
    await deleteApiKey('tavily');
    await refreshTavilyKeyStatus();
    setTavilyStatusMsg('Tavily key removida.');
  };

  const handleChangeVault = async () => {
    if (!confirmVault) {
      setConfirmVault(true);
      return;
    }
    setConfirmVault(false);
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-card rounded-lg shadow-xl dark:shadow-2xl w-full max-w-lg max-h-[80vh] overflow-auto animate-scale-in">
        <header className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Configurações</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors" aria-label="Fechar configurações">
            <CloseIcon className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 space-y-5">
          {/* Vault */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-1">Vault</h3>
            <p className="text-xs text-muted-foreground mb-2 truncate">
              {settings.vaultPath ?? '— nenhum —'}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleChangeVault}
                className={`px-3 py-1 rounded text-sm ${
                  confirmVault
                    ? 'bg-destructive text-primary-foreground hover:brightness-90'
                    : 'bg-muted hover:bg-accent text-foreground'
                }`}
              >
                {confirmVault ? 'Confirmar troca de vault?' : 'Trocar vault'}
              </button>
              {confirmVault && (
                <button
                  onClick={() => setConfirmVault(false)}
                  className="px-3 py-1 bg-muted hover:bg-accent rounded text-sm text-foreground"
                >
                  Cancelar
                </button>
              )}
            </div>
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
            {modelList && modelList.length > 0 ? (
              <select
                value={settings.defaultModel}
                onChange={(e) => void handleModelChange(e.target.value)}
                className="w-full text-sm px-2 py-1 border border-input bg-card text-foreground rounded focus:outline-none focus:border-primary transition-colors"
              >
                {!modelList.includes(settings.defaultModel) && settings.defaultModel && (
                  <option value={settings.defaultModel}>
                    {settings.defaultModel} (fora da lista)
                  </option>
                )}
                {modelList.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <>
                <input
                  type="text"
                  value={settings.defaultModel}
                  onChange={(e) => void handleModelChange(e.target.value)}
                  placeholder={
                    PROVIDERS.find((p) => p.id === settings.activeProvider)?.modelPlaceholder
                  }
                  className="w-full text-sm px-2 py-1 border border-input bg-card text-foreground rounded"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {modelsLoading
                    ? 'Carregando modelos do provider…'
                    : modelsError
                    ? `Não foi possível listar modelos: ${modelsError}. Digite manualmente.`
                    : hasKey === false
                    ? 'Configure uma API key para escolher da lista.'
                    : ''}
                </p>
              </>
            )}
          </section>

          {/* System Prompt */}
          <section>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold text-foreground">
                Prompt do sistema
              </label>
              <div className="flex items-center gap-2">
                {promptSaved && (
                  <span className="text-xs text-success">Salvo.</span>
                )}
                <button
                  onClick={handleResetPrompt}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Restaurar padrão
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Define a personalidade e as regras do Atlas. Deixe em branco para usar o prompt padrão.
            </p>
            <textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              onBlur={() => {
                const trimmed = promptDraft.trim();
                const current = settings.systemPrompt ?? '';
                if (trimmed !== current) {
                  void handleSavePrompt();
                }
              }}
              placeholder={defaultPrompt ?? 'Carregando prompt padrão…'}
              rows={14}
              className="w-full text-sm px-3 py-2 border border-input bg-card text-foreground rounded resize-y font-mono"
              style={{ minHeight: '220px' }}
              spellCheck={false}
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
                ? <span className="flex items-center gap-1"><SuccessIcon className="w-3.5 h-3.5 text-success" /> já configurada (criptografada com safeStorage).</span>
                : <span className="flex items-center gap-1"><WarningIcon className="w-3.5 h-3.5 text-warning" /> nenhuma key configurada.</span>}
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

          {/* Tavily (pesquisa web) */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Tavily — pesquisa web
            </h3>
            <p className="text-xs text-muted-foreground mb-2">
              Habilita a tool <code className="font-mono text-[11px]">web_search</code> para o
              Atlas pesquisar na internet ao gerar documentos. Independente do provider ativo.
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              {hasTavilyKey === null
                ? 'verificando…'
                : hasTavilyKey
                ? <span className="flex items-center gap-1"><SuccessIcon className="w-3.5 h-3.5 text-success" /> já configurada (criptografada com safeStorage).</span>
                : <span className="flex items-center gap-1"><WarningIcon className="w-3.5 h-3.5 text-warning" /> nenhuma key configurada — pesquisa web desativada.</span>}
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={tavilyKeyDraft}
                onChange={(e) => setTavilyKeyDraft(e.target.value)}
                placeholder="tvly-…"
                className="flex-1 text-sm px-2 py-1 border border-input bg-card text-foreground rounded"
              />
              <button
                onClick={handleSaveTavilyKey}
                className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm hover:brightness-90"
              >
                Salvar
              </button>
              {hasTavilyKey && (
                <button
                  onClick={handleDeleteTavilyKey}
                  className="px-3 py-1 bg-destructive/20 text-destructive rounded text-sm hover:bg-destructive/30"
                >
                  Remover
                </button>
              )}
            </div>
            {tavilyStatusMsg && <p className="text-xs text-success mt-2">{tavilyStatusMsg}</p>}
            {tavilyErrorMsg && <p className="text-xs text-destructive mt-2">{tavilyErrorMsg}</p>}
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

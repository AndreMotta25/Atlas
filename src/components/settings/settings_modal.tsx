import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useSettingsStore } from '../../stores/settings_store';
import { useVaultStore } from '../../stores/vault_store';
import type { AIProvider } from '../../types';

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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] overflow-auto">
        <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h2 className="text-lg font-semibold">Configurações</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
            ✕
          </button>
        </header>

        <div className="p-5 space-y-5">
          {/* Vault */}
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Vault</h3>
            <p className="text-xs text-slate-500 mb-2 truncate">
              {settings.vaultPath ?? '— nenhum —'}
            </p>
            <button
              onClick={handleChangeVault}
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded text-sm"
            >
              Trocar vault
            </button>
          </section>

          {/* Provider */}
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Provider ativo</h3>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => void handleProviderChange(p.id)}
                  className={`px-3 py-2 rounded text-sm border ${
                    settings.activeProvider === p.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Apenas DeepSeek está ativo no MVP. Os demais providers entram na Fase 4.
            </p>
          </section>

          {/* Model */}
          <section>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Modelo padrão
            </label>
            <input
              type="text"
              value={settings.defaultModel}
              onChange={(e) => void handleModelChange(e.target.value)}
              placeholder={
                PROVIDERS.find((p) => p.id === settings.activeProvider)?.modelPlaceholder
              }
              className="w-full text-sm px-2 py-1 border border-slate-300 rounded"
            />
          </section>

          {/* API Key */}
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">
              API Key — {settings.activeProvider}
            </h3>
            <p className="text-xs text-slate-500 mb-2">
              {hasKey === null
                ? 'verificando…'
                : hasKey
                ? '✅ já configurada (criptografada com safeStorage).'
                : '⚠ nenhuma key configurada.'}
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="Cole aqui a API key"
                className="flex-1 text-sm px-2 py-1 border border-slate-300 rounded"
              />
              <button
                onClick={handleSaveKey}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                Salvar
              </button>
              {hasKey && (
                <button
                  onClick={handleDeleteKey}
                  className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
                >
                  Remover
                </button>
              )}
            </div>
            {statusMsg && <p className="text-xs text-green-700 mt-2">{statusMsg}</p>}
            {errorMsg && <p className="text-xs text-red-700 mt-2">{errorMsg}</p>}
          </section>
        </div>

        <footer className="px-5 py-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1 bg-slate-800 text-white rounded text-sm hover:bg-slate-900"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
};

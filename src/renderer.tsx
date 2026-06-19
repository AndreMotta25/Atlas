import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AppShell } from './components/app_shell';
import { VaultPicker } from './components/vault_picker';
import { useSettingsStore } from './stores/settings_store';
import { LoadingSpinner } from './components/icons';

// ─── Theme bootstrap: apply .dark class BEFORE React mounts (prevents flash) ───
// Usa prefers-color-scheme do browser, que reflete o nativeTheme no Electron.
// Cobre o caso comum (system mode, default). No edge case em que o usuário
// escolheu "light" manualmente enquanto o SO está em dark, o useTheme hook
// corrige na montagem — sem flash perceptível.
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.classList.add('dark');
}

const App: React.FC = () => {
  const settings = useSettingsStore((s) => s.settings);
  const loaded = useSettingsStore((s) => s.loaded);
  const loadSettings = useSettingsStore((s) => s.load);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    void loadSettings().finally(() => setBooted(true));
  }, [loadSettings]);

  if (!booted || !loaded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-3">
        <LoadingSpinner className="w-8 h-8 text-primary" />
        <span className="text-sm text-muted-foreground">Carregando…</span>
      </div>
    );
  }

  return settings.vaultPath ? <AppShell /> : <VaultPicker />;
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

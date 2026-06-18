import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AppShell } from './components/app_shell';
import { VaultPicker } from './components/vault_picker';
import { useSettingsStore } from './stores/settings_store';

const App: React.FC = () => {
  const settings = useSettingsStore((s) => s.settings);
  const loaded = useSettingsStore((s) => s.loaded);
  const loadSettings = useSettingsStore((s) => s.load);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    void loadSettings().finally(() => setBooted(true));
  }, [loadSettings]);

  if (!booted || !loaded) {
    return <div className="flex items-center justify-center min-h-screen text-slate-500">Carregando…</div>;
  }

  return settings.vaultPath ? <AppShell /> : <VaultPicker />;
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

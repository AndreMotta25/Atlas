import React from 'react';
import { api } from '../lib/api';
import { useSettingsStore } from '../stores/settings_store';
import { useVaultStore } from '../stores/vault_store';
import { BooksIcon } from './icons';

interface VaultPickerProps {
  onPicked?: () => void;
}

export const VaultPicker: React.FC<VaultPickerProps> = ({ onPicked }) => {
  const loadSettings = useSettingsStore((s) => s.load);
  const loadTree = useVaultStore((s) => s.loadTree);

  const handleSelect = async () => {
    const status = await api.vault.select();
    if (status.configured) {
      await loadSettings();
      await loadTree();
      onPicked?.();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
      <div className="max-w-md text-center px-8 animate-slide-up">
        <div className="mb-4 text-muted-foreground"><BooksIcon className="w-14 h-14" /></div>
        <h1 className="text-3xl font-bold mb-2">Bem-vindo ao Atlas</h1>
        <p className="text-muted-foreground mb-8">
          Escolha uma pasta no seu computador para ser o seu vault. Todas as suas notas em
          Markdown ficarão lá — portáteis, versionáveis e legíveis fora do app.
        </p>
        <button
          onClick={handleSelect}
          className="px-6 py-3 bg-primary text-primary-foreground hover:brightness-90 rounded-lg font-medium shadow-sm transition-all"
        >
          Escolher pasta do vault
        </button>
        <p className="mt-6 text-xs text-muted-foreground">
          Dica: você pode usar uma pasta sincronizada com git, Dropbox, etc.
        </p>
      </div>
    </div>
  );
};

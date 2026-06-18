import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSettingsStore } from '../stores/settings_store';
import type { ThemeMode } from '../types';

function applyDarkClass(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark);
}

export const useTheme = () => {
  const [isDark, setIsDark] = useState(false);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);

  // Initialize: read current OS preference and listen for system changes.
  useEffect(() => {
    void api.shouldUseDarkColors().then((dark) => {
      setIsDark(dark);
      applyDarkClass(dark);
    });

    const unsub = api.onThemeChanged((dark) => {
      setIsDark(dark);
      applyDarkClass(dark);
    });

    return unsub;
  }, []);

  const setTheme = async (mode: ThemeMode) => {
    // set-source já retorna shouldUseDarkColors — evita segunda chamada IPC
    const result = await api.setThemeSource(mode) as { success: boolean; shouldUseDarkColors: boolean };
    if (result?.shouldUseDarkColors !== undefined) {
      setIsDark(result.shouldUseDarkColors);
      applyDarkClass(result.shouldUseDarkColors);
    }
    await updateSettings({ themeMode: mode });
  };

  return { isDark, themeMode: settings.themeMode, setTheme };
};

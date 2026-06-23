import React from 'react';
import { useTheme } from '../hooks/use_theme';
import type { ThemeMode } from '../types';

interface ThemeOption {
  id: ThemeMode;
  label: string;
  icon: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'light',
    label: 'Claro',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`,
  },
  {
    id: 'dark',
    label: 'Escuro',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  },
  {
    id: 'system',
    label: 'Sistema',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
  },
];

interface ThemeToggleProps {
  variant?: 'full' | 'compact';
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ variant = 'full' }) => {
  const { themeMode, setTheme } = useTheme();

  if (variant === 'compact') {
    return (
      <div
        role="group"
        aria-label="Tema"
        className="flex items-center bg-muted/40 border border-border rounded-lg p-0.5"
      >
        {THEME_OPTIONS.map((opt) => {
          const active = themeMode === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => void setTheme(opt.id)}
              title={opt.label}
              aria-label={opt.label}
              aria-pressed={active}
              className={`p-1 rounded transition-colors ${
                active
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span dangerouslySetInnerHTML={{ __html: opt.icon }} />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {THEME_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          onClick={() => void setTheme(opt.id)}
          className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            themeMode === opt.id
              ? 'border-primary bg-accent text-accent-foreground'
              : 'border-border hover:bg-accent text-foreground'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

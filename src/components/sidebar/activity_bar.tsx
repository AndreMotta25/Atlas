import React from 'react';
import { ProjectsIcon, SearchActivityIcon, GearActivityIcon, HomeIcon, AtlasActivityIcon } from '../icons';

export type ActivityId = 'projects' | 'search' | 'settings' | 'atlas';

interface ActivityEntry {
  id: ActivityId;
  icon: React.FC<{ className?: string }>;
  label: string;
}

const ACTIVITIES: ActivityEntry[] = [
  { id: 'projects', icon: ProjectsIcon, label: 'Projetos' },
  { id: 'search', icon: SearchActivityIcon, label: 'Pesquisar' },
  { id: 'settings', icon: GearActivityIcon, label: 'Configurações' },
  { id: 'atlas', icon: AtlasActivityIcon, label: 'Atlas' },
];

interface ActivityBarProps {
  active: ActivityId;
  onChange: (id: ActivityId) => void;
  /** Whether the Home view is currently shown in the main area. */
  homeActive?: boolean;
  /** Navigate to the Home view. */
  onHome?: () => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({ active, onChange, homeActive, onHome }) => (
  <div className="flex flex-col items-center w-11 shrink-0 border-r border-border bg-muted/50 py-2 gap-1">
    {onHome && (
      <>
        <button
          onClick={onHome}
          title="Início"
          aria-label="Início"
          className={`relative w-9 h-9 flex items-center justify-center rounded-md transition-colors ${
            homeActive
              ? 'text-foreground bg-accent'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
          }`}
        >
          {homeActive && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-foreground rounded-r-full" />
          )}
          <HomeIcon className="w-5 h-5" />
        </button>
        <div className="w-6 h-px bg-border my-1" />
      </>
    )}
    {ACTIVITIES.map((entry) => {
      const isActive = !homeActive && active === entry.id;
      return (
        <button
          key={entry.id}
          onClick={() => onChange(entry.id)}
          title={entry.label}
          aria-label={entry.label}
          className={`relative w-9 h-9 flex items-center justify-center rounded-md transition-colors ${
            isActive
              ? 'text-foreground bg-accent'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
          }`}
        >
          {/* Active indicator bar on the left (VS Code style) */}
          {isActive && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-foreground rounded-r-full" />
          )}
          <entry.icon className="w-5 h-5" />
        </button>
      );
    })}
  </div>
);

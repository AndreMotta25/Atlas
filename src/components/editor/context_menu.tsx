import { useEffect, useRef } from 'react';

export interface MenuSeparator {
  type: 'separator';
}

export interface MenuItemDef {
  type: 'item';
  label: string;
  shortcut?: string;
  icon?: string;
  onSelect: () => void;
}

export type MenuEntry = MenuItemDef | MenuSeparator;

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuEntry[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handlePointer);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Clamp position so the menu stays inside the window.
  const maxX = window.innerWidth - 240;
  const maxY = window.innerHeight - items.length * 32 - 16;
  const left = Math.min(x, Math.max(8, maxX));
  const top = Math.min(y, Math.max(8, maxY));

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left, top }}
      className="fixed z-50 min-w-[220px] bg-card border border-border rounded-lg shadow-lg dark:shadow-2xl py-1 text-sm"
    >
      {items.map((entry, i) => {
        if (entry.type === 'separator') {
          return <div key={`sep-${i}`} className="h-px bg-border my-1" />;
        }
        return (
          <button
            key={entry.label}
            role="menuitem"
            onClick={() => {
              entry.onSelect();
              onClose();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-accent flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-2.5">
              {entry.icon && (
                <span className="w-4 h-4 text-muted-foreground shrink-0" dangerouslySetInnerHTML={{ __html: entry.icon }} />
              )}
              <span>{entry.label}</span>
            </span>
            {entry.shortcut && (
              <span className="text-xs text-muted-foreground">{entry.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

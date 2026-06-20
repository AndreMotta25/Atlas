import { useEffect, useRef, useState } from 'react';

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

export interface MenuSubmenu {
  type: 'submenu';
  label: string;
  icon?: string;
  children: MenuEntry[];
}

export type MenuEntry = MenuItemDef | MenuSeparator | MenuSubmenu;

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuEntry[];
  onClose: () => void;
}

const SubmenuEntry: React.FC<{ entry: MenuSubmenu; onClose: () => void }> = ({ entry, onClose }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handle);
    return () => window.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        role="menuitem"
        className="w-full text-left px-3 py-1.5 hover:bg-accent flex items-center justify-between gap-4"
      >
        <span className="flex items-center gap-2.5">
          {entry.icon && (
            <span className="w-4 h-4 text-muted-foreground shrink-0" dangerouslySetInnerHTML={{ __html: entry.icon }} />
          )}
          <span>{entry.label}</span>
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-muted-foreground">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-full top-0 ml-1 min-w-[200px] bg-card border border-border rounded-lg shadow-lg py-1 text-sm animate-scale-in">
          {entry.children.map((child, i) => {
            if (child.type === 'separator') {
              return <div key={`subsep-${i}`} className="h-px bg-border my-1" />;
            }
            if (child.type === 'item') {
              return (
                <button
                  key={`${child.label}-${i}`}
                  role="menuitem"
                  onClick={() => {
                    child.onSelect();
                    onClose();
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-accent flex items-center justify-between gap-4"
                >
                  <span className="flex items-center gap-2.5">
                    {child.icon && (
                      <span className="w-4 h-4 text-muted-foreground shrink-0" dangerouslySetInnerHTML={{ __html: child.icon }} />
                    )}
                    <span>{child.label}</span>
                  </span>
                  {child.shortcut && (
                    <span className="text-xs text-muted-foreground">{child.shortcut}</span>
                  )}
                </button>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
};

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
      className="fixed z-50 min-w-[220px] bg-card border border-border rounded-lg shadow-lg dark:shadow-2xl py-1 text-sm animate-scale-in"
    >
      {items.map((entry, i) => {
        if (entry.type === 'separator') {
          return <div key={`sep-${i}`} className="h-px bg-border my-1" />;
        }
        if (entry.type === 'submenu') {
          return <SubmenuEntry key={`sub-${i}`} entry={entry} onClose={onClose} />;
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

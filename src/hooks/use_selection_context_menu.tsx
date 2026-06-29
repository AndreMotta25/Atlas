import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ContextMenu, type MenuEntry } from '../components/editor/context_menu';

/**
 * Adds a right-click context menu (Copiar / Selecionar tudo) to any container
 * that renders text the user can select — e.g. rendered chat messages, page
 * previews, etc. Unlike `useTextContextMenu`, this works on plain HTML elements
 * (no textarea/input required) and uses `window.getSelection()`.
 *
 * Cut/Paste are omitted because the target is read-only.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null);
 *   const ctx = useSelectionContextMenu(ref);
 *   <div ref={ref} onContextMenu={ctx.onContextMenu}>{children}</div>
 *   {ctx.menu}
 */
export const useSelectionContextMenu = <T extends HTMLElement>(
  ref: React.RefObject<T | null>,
) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const close = useCallback(() => setPos(null), []);

  const onContextMenu = useCallback((e: React.MouseEvent<T>) => {
    e.preventDefault();
    setPos({ x: e.clientX, y: e.clientY });
  }, []);

  // Close on resize / scroll — otherwise the menu floats away from the click.
  useEffect(() => {
    if (!pos) return;
    const onLayoutChange = () => setPos(null);
    window.addEventListener('resize', onLayoutChange);
    window.addEventListener('scroll', onLayoutChange, true);
    return () => {
      window.removeEventListener('resize', onLayoutChange);
      window.removeEventListener('scroll', onLayoutChange, true);
    };
  }, [pos]);

  const selectionInsideContainer = (() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return null;
    const node = sel.anchorNode;
    if (!node || !ref.current?.contains(node)) return null;
    return sel.toString();
  })();

  const copy = async () => {
    const text = selectionInsideContainer;
    setPos(null);
    if (!text) return;
    try {
      await api.clipboard.writeText(text);
    } catch {
      // ignore — clipboard may be unavailable
    }
  };

  const selectAll = () => {
    const el = ref.current;
    setPos(null);
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const items: MenuEntry[] = [];
  if (selectionInsideContainer) {
    items.push({ type: 'item', label: 'Copiar', shortcut: 'Ctrl+C', onSelect: () => void copy() });
    items.push({ type: 'separator' });
  }
  items.push({ type: 'item', label: 'Selecionar tudo', shortcut: 'Ctrl+A', onSelect: selectAll });

  const menu = pos ? (
    <ContextMenu x={pos.x} y={pos.y} items={items} onClose={close} />
  ) : null;

  return { onContextMenu, menu };
};

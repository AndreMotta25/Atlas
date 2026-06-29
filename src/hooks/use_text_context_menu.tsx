import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ContextMenu, type MenuEntry } from '../components/editor/context_menu';

/**
 * Adds a right-click context menu (Copiar / Recortar / Colar / Selecionar tudo)
 * to a textarea or input. Electron's default browser context menu is suppressed
 * in sandboxed renderers, so we rebuild the essentials using the existing
 * ContextMenu component and the native clipboard via IPC.
 *
 * Usage:
 *   const textareaRef = useRef<HTMLTextAreaElement>(null);
 *   const ctxMenu = useTextContextMenu(textareaRef);
 *   <textarea ref={textareaRef} onContextMenu={ctxMenu.onContextMenu} />
 *   {ctxMenu.menu}
 */
export const useTextContextMenu = <T extends HTMLInputElement | HTMLTextAreaElement>(
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

  const run = (fn: () => void) => {
    const el = ref.current;
    if (el) {
      el.focus();
      fn();
    }
    setPos(null);
  };

  const copy = () =>
    run(() => {
      const el = ref.current;
      if (!el) return;
      const { selectionStart, selectionEnd } = el;
      if (selectionStart === selectionEnd) return;
      const text = el.value.slice(selectionStart, selectionEnd);
      void api.clipboard.writeText(text);
    });

  const cut = () =>
    run(() => {
      const el = ref.current;
      if (!el) return;
      const { selectionStart, selectionEnd } = el;
      if (selectionStart === selectionEnd) return;
      const text = el.value.slice(selectionStart, selectionEnd);
      void api.clipboard.writeText(text);
      // Trigger React's onChange by using setRangeText + an InputEvent.
      el.setRangeText('', selectionStart, selectionEnd, 'end');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

  const paste = async () => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const result = await api.clipboard.readText();
    if (!result.success) {
      setPos(null);
      return;
    }
    const text = result.value;
    if (!text) {
      setPos(null);
      return;
    }
    const { selectionStart, selectionEnd } = el;
    el.setRangeText(text, selectionStart, selectionEnd, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setPos(null);
  };

  const selectAll = () =>
    run(() => {
      ref.current?.select();
    });

  const hasSelection = (() => {
    const el = ref.current;
    if (!el) return false;
    return el.selectionStart !== el.selectionEnd;
  })();

  const items: MenuEntry[] = [
    { type: 'item', label: 'Recortar', shortcut: 'Ctrl+X', onSelect: cut },
    { type: 'item', label: 'Copiar', shortcut: 'Ctrl+C', onSelect: copy },
    { type: 'item', label: 'Colar', shortcut: 'Ctrl+V', onSelect: () => void paste() },
    { type: 'separator' },
    { type: 'item', label: 'Selecionar tudo', shortcut: 'Ctrl+A', onSelect: selectAll },
  ];

  // Disable Cut/Copy when there's no selection by intercepting onSelect.
  const itemsDisabled: MenuEntry[] = items.map((entry) => {
    if (entry.type !== 'item') return entry;
    if ((entry.label === 'Recortar' || entry.label === 'Copiar') && !hasSelection) {
      // Render but mark as disabled via a noop onSelect; the ContextMenu component
      // doesn't support a `disabled` flag today, so we simply hide the items
      // when no selection is present.
      return null;
    }
    return entry;
  }).filter((e): e is MenuEntry => e !== null);

  const menu = pos ? (
    <ContextMenu x={pos.x} y={pos.y} items={itemsDisabled} onClose={close} />
  ) : null;

  return { onContextMenu, menu };
};

import { EditorState } from '@codemirror/state';
import { EditorView, keymap, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
} from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { useEffect, useRef, useState } from 'react';
import { useVaultStore } from '../../stores/vault_store';
import { livePreview } from './live_preview';
import { ContextMenu, type MenuEntry } from './context_menu';
import {
  changeIndent,
  insertHorizontalRule,
  insertLink,
  setHeading,
  toggleLinePrefix,
  wrapSelection,
} from './markdown_actions';

const SAVE_DEBOUNCE_MS = 500;

export const EditorPane = () => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentPath = useVaultStore((s) => s.currentPath);
  const currentContent = useVaultStore((s) => s.currentContent);
  const saveCurrent = useVaultStore((s) => s.saveCurrent);
  const setDirty = useVaultStore((s) => s.setDirty);
  const dirty = useVaultStore((s) => s.dirty);

  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Create the editor once.
  useEffect(() => {
    if (!hostRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const text = update.state.doc.toString();

      setDirty(true);

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void saveCurrent(text);
      }, SAVE_DEBOUNCE_MS);
    });

    const state = EditorState.create({
      doc: '',
      extensions: [
        history(),
        bracketMatching(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        livePreview,
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
        updateListener,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setMenuPos({ x: e.clientX, y: e.clientY });
    };
    view.dom.addEventListener('contextmenu', handleContextMenu);

    return () => {
      view.dom.removeEventListener('contextmenu', handleContextMenu);
      view.destroy();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [saveCurrent, setDirty]);

  // When the open page changes, replace the document.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (currentPath === null) {
      if (view.state.doc.length > 0) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: '' },
        });
      }
      return;
    }

    if (view.state.doc.toString() === currentContent) return;

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: currentContent },
    });
  }, [currentPath, currentContent]);

  const buildMenu = (): MenuEntry[] => {
    const view = viewRef.current;
    if (!view) return [];
    const H = `<svg viewBox="0 0 16 16" fill="currentColor"><text x="0" y="14" font-size="14" font-weight="bold" font-family="sans-serif">H</text></svg>`;
    const B = `<svg viewBox="0 0 16 16" fill="currentColor"><text x="0" y="14" font-size="14" font-weight="bold" font-family="serif">B</text></svg>`;
    const I = `<svg viewBox="0 0 16 16" fill="currentColor"><text x="0" y="14" font-size="14" font-style="italic" font-family="serif">I</text></svg>`;
    const S = `<svg viewBox="0 0 16 16" fill="currentColor"><text x="0" y="14" font-size="14" text-decoration="line-through" font-family="serif">S</text></svg>`;
    const CODE = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 4L2 8l4 4M10 4l4 4-4 4"/></svg>`;
    const LINK = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 9a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1"/><path d="M9 7a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1"/></svg>`;
    const QUOTE = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 3C3 3 2 4 2 6v4h4V6H4c0-1 1-1 1-1V3Zm8 0c-1 0-2 1-2 3v4h4V6h-2c0-1 1-1 1-1V3Z"/></svg>`;
    const LIST = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 3h1v1H3V3Zm0 4h1v1H3V7Zm0 4h1v1H3v-1Zm3-8h7v1H6V3Zm0 4h7v1H6V7Zm0 4h7v1H6v-1Z"/></svg>`;
    const HR = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="8" x2="14" y2="8"/></svg>`;
    const INDENT = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 3h10v1H3V3Zm5 4h5v1H8V7Zm0 4h5v1H8v-1ZM3 7l2 2-2 2V7Z"/></svg>`;
    const OUTDENT = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 3h10v1H3V3Zm0 4h5v1H3V7Zm0 4h5v1H3v-1ZM8 7l2 2-2 2V7Z"/></svg>`;

    return [
      { type: 'item', label: 'Título 1', shortcut: '#', icon: H, onSelect: () => setHeading(view, 1) },
      { type: 'item', label: 'Título 2', shortcut: '##', icon: H, onSelect: () => setHeading(view, 2) },
      { type: 'item', label: 'Título 3', shortcut: '###', icon: H, onSelect: () => setHeading(view, 3) },
      { type: 'separator' },
      { type: 'item', label: 'Negrito',  icon: B, shortcut: '**',    onSelect: () => wrapSelection(view, '**') },
      { type: 'item', label: 'Itálico',  icon: I, shortcut: '*',     onSelect: () => wrapSelection(view, '*') },
      { type: 'item', label: 'Riscado',  icon: S, shortcut: '~~',    onSelect: () => wrapSelection(view, '~~') },
      { type: 'item', label: 'Código inline', icon: CODE, shortcut: '`', onSelect: () => wrapSelection(view, '`') },
      { type: 'separator' },
      { type: 'item', label: 'Link',     icon: LINK, shortcut: '[]()',  onSelect: () => insertLink(view) },
      { type: 'item', label: 'Citação',  icon: QUOTE, shortcut: '>',    onSelect: () => toggleLinePrefix(view, '>') },
      { type: 'item', label: 'Lista',    icon: LIST, shortcut: '-',     onSelect: () => toggleLinePrefix(view, '-') },
      { type: 'item', label: 'Régua',    icon: HR, shortcut: '---',     onSelect: () => insertHorizontalRule(view) },
      { type: 'separator' },
      { type: 'item', label: 'Aumentar recuo', icon: INDENT, shortcut: 'Tab',  onSelect: () => changeIndent(view, 2) },
      { type: 'item', label: 'Diminuir recuo', icon: OUTDENT, shortcut: 'Shift+Tab', onSelect: () => changeIndent(view, -2) },
    ];
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500">
        <span className="truncate">{currentPath ?? 'Nenhuma página selecionada'}</span>
        <span>{dirty ? 'Salvando…' : 'Salvo'}</span>
      </div>
      <div ref={hostRef} className="flex-1 overflow-auto bg-white" />
      {menuPos && (
        <ContextMenu
          x={menuPos.x}
          y={menuPos.y}
          items={buildMenu()}
          onClose={() => setMenuPos(null)}
        />
      )}
    </div>
  );
};

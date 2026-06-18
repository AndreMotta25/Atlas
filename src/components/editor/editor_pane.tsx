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
    return [
      { type: 'item', label: 'Título 1', shortcut: '#',     onSelect: () => setHeading(view, 1) },
      { type: 'item', label: 'Título 2', shortcut: '##',    onSelect: () => setHeading(view, 2) },
      { type: 'item', label: 'Título 3', shortcut: '###',   onSelect: () => setHeading(view, 3) },
      { type: 'separator' },
      { type: 'item', label: 'Negrito',  shortcut: '**',    onSelect: () => wrapSelection(view, '**') },
      { type: 'item', label: 'Itálico',  shortcut: '*',     onSelect: () => wrapSelection(view, '*') },
      { type: 'item', label: 'Riscado',  shortcut: '~~',    onSelect: () => wrapSelection(view, '~~') },
      { type: 'item', label: 'Código inline', shortcut: '`', onSelect: () => wrapSelection(view, '`') },
      { type: 'separator' },
      { type: 'item', label: 'Link',     shortcut: '[]()',  onSelect: () => insertLink(view) },
      { type: 'item', label: 'Citação',  shortcut: '>',     onSelect: () => toggleLinePrefix(view, '>') },
      { type: 'item', label: 'Lista',    shortcut: '-',     onSelect: () => toggleLinePrefix(view, '-') },
      { type: 'item', label: 'Régua',    shortcut: '---',   onSelect: () => insertHorizontalRule(view) },
      { type: 'separator' },
      { type: 'item', label: 'Aumentar recuo', shortcut: 'Tab',  onSelect: () => changeIndent(view, 2) },
      { type: 'item', label: 'Diminuir recuo', shortcut: 'Shift+Tab', onSelect: () => changeIndent(view, -2) },
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

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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useVaultStore } from '../../stores/vault_store';
import { useChatStore } from '../../stores/chat_store';
import { livePreview } from './live_preview';
import { formatMarkdown } from './format_markdown';
import { ContextMenu, type MenuEntry } from './context_menu';
import { CommentPopup } from './comment_popup';
import type { CommentEntry } from '../app_shell';
import {
  changeIndent,
  insertHorizontalRule,
  insertLink,
  setHeading,
  toggleLinePrefix,
  wrapSelection,
} from './markdown_actions';

const SAVE_DEBOUNCE_MS = 500;

interface EditorPaneProps {
  onCommentsChange: (comments: CommentEntry[]) => void;
  onCommentSelect: (index: number) => void;
  deleteCommentRef: React.MutableRefObject<((index: number) => void) | null>;
  updateCommentRef: React.MutableRefObject<((index: number, newComment: string) => void) | null>;
}

export const EditorPane: React.FC<EditorPaneProps> = ({ onCommentsChange, onCommentSelect, deleteCommentRef, updateCommentRef }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentPath = useVaultStore((s) => s.currentPath);
  const currentContent = useVaultStore((s) => s.currentContent);
  const saveCurrent = useVaultStore((s) => s.saveCurrent);
  const setDirty = useVaultStore((s) => s.setDirty);
  const dirty = useVaultStore((s) => s.dirty);

  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Live doc text — updated on every CodeMirror change, used to recompute
  // comments immediately (before the debounced save flushes currentContent).
  const [liveDoc, setLiveDoc] = useState('');

  // Popup state — creation
  const [commentDraft, setCommentDraft] = useState<{
    docFrom: number;
    docTo: number;
    text: string;
    screenX: number;
    screenY: number;
  } | null>(null);

  // Popup state — editing an existing highlight
  const [commentEdit, setCommentEdit] = useState<{
    index: number;
    text: string;
    comment: string;
    screenX: number;
    screenY: number;
  } | null>(null);

  // Extract all comments from the document — recomputed on every doc edit via
  // `liveDoc`, so the sidebar list stays in sync immediately after
  // create/edit/delete actions (before the debounced save updates currentContent).
  const comments = useMemo<CommentEntry[]>(() => {
    const doc = liveDoc;
    const results: CommentEntry[] = [];
    const HIGHLIGHT_GLOBAL = /==([^=]+)==/g;
    let hm: RegExpExecArray | null;
    while ((hm = HIGHLIGHT_GLOBAL.exec(doc))) {
      const after = doc.slice(hm.index + hm[0].length, hm.index + hm[0].length + 50);
      const cm = /<!--c:(.+?)-->/.exec(after);
      if (cm) {
        results.push({ pos: hm.index, text: hm[1], comment: cm[1].trim() });
      }
    }
    return results;
  }, [liveDoc]);

  // Report comments upstream
  useEffect(() => {
    onCommentsChange(comments);
  }, [comments, onCommentsChange]);

  // Delete the comment at the given index (called from ChatPanel via AppShell)
  deleteCommentRef.current = (index: number) => {
    const view = viewRef.current;
    if (!view) return;
    // Re-read comments from current document
    const doc = view.state.doc.toString();
    const currentComments: CommentEntry[] = [];
    const HIGHLIGHT_GLOBAL = /==([^=]+)==/g;
    let hm: RegExpExecArray | null;
    while ((hm = HIGHLIGHT_GLOBAL.exec(doc))) {
      const after = doc.slice(hm.index + hm[0].length, hm.index + hm[0].length + 50);
      const cm = /<!--c:(.+?)-->/.exec(after);
      if (cm) currentComments.push({ pos: hm.index, text: hm[1], comment: cm[1].trim() });
    }
    const c = currentComments[index];
    if (!c) return;

    const escText = c.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escComment = c.comment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`==${escText}==<!--c:${escComment}-->`, 'g');
    const match = regex.exec(doc);
    if (!match) return;

    view.dispatch({
      changes: { from: match.index, to: match.index + match[0].length, insert: c.text },
    });
  };

  // Update the comment text at the given index (called from ChatPanel via AppShell)
  updateCommentRef.current = (index: number, newComment: string) => {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc.toString();
    const currentComments: CommentEntry[] = [];
    const HIGHLIGHT_GLOBAL = /==([^=]+)==/g;
    let hm: RegExpExecArray | null;
    while ((hm = HIGHLIGHT_GLOBAL.exec(doc))) {
      const after = doc.slice(hm.index + hm[0].length, hm.index + hm[0].length + 50);
      const cm = /<!--c:(.+?)-->/.exec(after);
      if (cm) currentComments.push({ pos: hm.index, text: hm[1], comment: cm[1].trim() });
    }
    const c = currentComments[index];
    if (!c) return;

    const escText = c.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escComment = c.comment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`==${escText}==<!--c:${escComment}-->`, 'g');
    const match = regex.exec(doc);
    if (!match) return;

    view.dispatch({
      changes: { from: match.index, to: match.index + match[0].length, insert: `==${c.text}==<!--c:${newComment}-->` },
    });
  };

  // Click handler for highlights → notify parent
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const highlight = target.closest('.atlas-highlight') as HTMLElement | null;
      if (!highlight) return;
      try {
        const v = viewRef.current;
        if (!v) return;
        const pos = v.posAtDOM(highlight);
        const idx = comments.findIndex((c) => c.pos === pos || (c.pos <= pos && c.pos + c.text.length >= pos));
        if (idx === -1) return;
        const c = comments[idx];
        const coords = v.coordsAtPos(c.pos);
        onCommentSelect(idx);
        setCommentEdit({
          index: idx,
          text: c.text,
          comment: c.comment,
          screenX: coords?.left ?? e.clientX,
          screenY: (coords?.bottom ?? e.clientY) + 6,
        });
      } catch {
        // ignore
      }
    };

    view.dom.addEventListener('click', handleClick);
    return () => view.dom.removeEventListener('click', handleClick);
  }, [comments, onCommentSelect]);

  // Create the editor once.
  useEffect(() => {
    if (!hostRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const text = update.state.doc.toString();

      setLiveDoc(text);
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
        setLiveDoc('');
      }
      return;
    }

    if (view.state.doc.toString() === currentContent) {
      setLiveDoc(currentContent);
      return;
    }

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: currentContent },
    });
    setLiveDoc(currentContent);
  }, [currentPath, currentContent]);

  const addComment = () => {
    const view = viewRef.current;
    if (!view) return;

    const sel = view.state.selection.main;
    const text = view.state.sliceDoc(sel.from, sel.to) || 'texto';

    // Position popup near the selection (or cursor), falling back to the menu position
    const coords = view.coordsAtPos(sel.from);
    const screenX = coords?.left ?? menuPos?.x ?? window.innerWidth / 2;
    const screenY = (coords?.bottom ?? menuPos?.y ?? window.innerHeight / 2) + 6;

    setCommentDraft({ docFrom: sel.from, docTo: sel.to, text, screenX, screenY });
  };

  const commitCreate = (comment: string) => {
    const view = viewRef.current;
    if (!view || !commentDraft) return;
    view.dispatch({
      changes: {
        from: commentDraft.docFrom,
        to: commentDraft.docTo,
        insert: `==${commentDraft.text}==<!--c:${comment}-->`,
      },
    });
    setCommentDraft(null);
  };

  const commitEdit = (comment: string) => {
    const view = viewRef.current;
    if (!view || !commentEdit) return;
    const c = commentEdit;
    const doc = view.state.doc.toString();
    const escText = c.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match the highlight optionally followed by its current comment annotation
    const regex = new RegExp(`==${escText}==(<!--c:.*?-->)?`);
    const match = regex.exec(doc);
    if (match) {
      view.dispatch({
        changes: {
          from: match.index,
          to: match.index + match[0].length,
          insert: `==${c.text}==<!--c:${comment}-->`,
        },
      });
    }
    setCommentEdit(null);
  };

  const deleteFromEdit = () => {
    const view = viewRef.current;
    if (!view || !commentEdit) return;
    const c = commentEdit;
    const doc = view.state.doc.toString();
    const escText = c.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`==${escText}==(<!--c:.*?-->)?`);
    const match = regex.exec(doc);
    if (match) {
      view.dispatch({
        changes: {
          from: match.index,
          to: match.index + match[0].length,
          insert: c.text,
        },
      });
    }
    setCommentEdit(null);
  };

  const formatDocument = () => {
    const view = viewRef.current;
    if (!view) return;
    const text = view.state.doc.toString();
    const formatted = formatMarkdown(text);
    if (formatted === text) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: formatted },
    });
  };

  const sendSelectionToAtlas = () => {
    const view = viewRef.current;
    if (!view) return;
    const text = view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    );
    if (!text.trim()) return;
    const chatStore = useChatStore.getState();
    chatStore.loadSnippetContext(text);
    // Also load the current page so Atlas has context about where the snippet came from.
    if (currentPath) {
      chatStore.loadPageContext(currentPath);
    }
    setMenuPos(null);
  };

  const buildMenu = (): MenuEntry[] => {
    const view = viewRef.current;
    if (!view) return [];
    const hasSelection = !view.state.selection.main.empty;
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
    const COMMENT = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h5l3 3 2-2h0a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z"/></svg>`;

    const SEND_ATLAS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><circle cx="12" cy="12" r="10"/><path d="M16 12l-4 4-4-4M12 8v8"/></svg>`;

    return [
      ...(hasSelection
        ? [
            {
              type: 'item' as const,
              label: 'Enviar seleção para o Atlas',
              icon: SEND_ATLAS,
              onSelect: sendSelectionToAtlas,
            },
            { type: 'separator' as const },
          ]
        : []),
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
      { type: 'separator' },
      { type: 'item', label: 'Comentário', icon: COMMENT, onSelect: addComment },
      { type: 'item', label: 'Formatar', icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="4" x2="11" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="8" y2="12"/><polyline points="12 10 14 8 12 6"/></svg>`, onSelect: formatDocument },
    ];
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate">{currentPath ?? 'Nenhuma página selecionada'}</span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={formatDocument}
            title="Formatar Markdown"
            className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <line x1="4" y1="6" x2="16" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="12" y2="18" />
              <polyline points="18 16 20 14 22 16" />
            </svg>
          </button>
          <span>{dirty ? 'Salvando…' : 'Salvo'}</span>
        </div>
      </div>
      <div ref={hostRef} className="flex-1 overflow-auto relative" />

      {menuPos && (
        <ContextMenu
          x={menuPos.x}
          y={menuPos.y}
          items={buildMenu()}
          onClose={() => setMenuPos(null)}
        />
      )}

      {commentDraft && (
        <CommentPopup
          mode="create"
          highlightText={commentDraft.text}
          position={{ x: commentDraft.screenX, y: commentDraft.screenY }}
          onSave={commitCreate}
          onCancel={() => setCommentDraft(null)}
        />
      )}

      {commentEdit && (
        <CommentPopup
          mode="edit"
          highlightText={commentEdit.text}
          initialComment={commentEdit.comment}
          position={{ x: commentEdit.screenX, y: commentEdit.screenY }}
          onSave={commitEdit}
          onCancel={() => setCommentEdit(null)}
          onDelete={deleteFromEdit}
        />
      )}
    </div>
  );
};

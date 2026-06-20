import { EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  highlightActiveLine,
  highlightSpecialChars,
  highlightTrailingWhitespace,
  dropCursor,
  drawSelection,
  rectangularSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  HighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  codeFolding,
} from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap, autocompletion } from '@codemirror/autocomplete';
import { linter } from '@codemirror/lint';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useVaultStore } from '../../stores/vault_store';
import { useChatStore } from '../../stores/chat_store';
import { useSettingsStore } from '../../stores/settings_store';
import { livePreview, livePreviewModeField, setLivePreviewMode, type LivePreviewMode } from './live_preview';
import { formatMarkdown } from './format_markdown';
import { atlasCompletionSources } from './autocomplete_source';
import { markdownLintSource } from './markdown_lint';
import { markdownFoldService } from './markdown_fold';
import { stickyHeaderPlugin } from './sticky_header';
import { ContextMenu, type MenuEntry } from './context_menu';
import { CommentPopup } from './comment_popup';
import {
  findComments,
  serializeAnnotation,
  genCommentId,
  type CommentEntry,
} from './comment_parser';
import {
  ChatIcon, FormatIcon, EyeIcon, PencilIcon, TrashIcon, SendIcon,
} from '../icons';
import { HIGHLIGHT_COLORS, DEFAULT_HIGHLIGHT_COLOR, type HighlightColor } from '../../types';
import { api } from '../../lib/api';
import {
  changeIndent,
  insertHorizontalRule,
  insertLink,
  setHeading,
  toggleLinePrefix,
  wrapSelection,
  insertImage,
  insertTable,
  insertCheckbox,
  insertCodeBlock,
} from './markdown_actions';

const SAVE_DEBOUNCE_MS = 500;

/** Custom highlight that removes the underline CodeMirror's defaultHighlightStyle
 *  applies to all headings. Registered BEFORE the default so it takes precedence. */
const noHeadingUnderline = syntaxHighlighting(
  HighlightStyle.define([{ tag: tags.heading, textDecoration: 'none' }]),
);

interface EditorPaneProps {
  onCommentsChange: (comments: CommentEntry[]) => void;
  onCommentSelect: (index: number) => void;
  deleteCommentRef: React.MutableRefObject<((index: number) => void) | null>;
  updateCommentRef: React.MutableRefObject<((index: number, newComment: string) => void) | null>;
  scrollToCommentRef: React.MutableRefObject<((index: number) => void) | null>;
  chatTab: 'chat' | 'comments';
  onSetTab: (tab: 'chat' | 'comments') => void;
  commentCount: number;
}

export const EditorPane: React.FC<EditorPaneProps> = ({ onCommentsChange, onCommentSelect, deleteCommentRef, updateCommentRef, scrollToCommentRef, chatTab, onSetTab, commentCount }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentPath = useVaultStore((s) => s.currentPath);
  const currentContent = useVaultStore((s) => s.currentContent);
  const saveCurrent = useVaultStore((s) => s.saveCurrent);
  const setDirty = useVaultStore((s) => s.setDirty);
  const dirty = useVaultStore((s) => s.dirty);

  const fontFamily = useSettingsStore((s) => s.settings.fontFamily);
  const updateSettings = useSettingsStore((s) => s.update);

  const streaming = useChatStore((s) => s.streaming);
  const sendChat = useChatStore((s) => s.send);
  const cancelChat = useChatStore((s) => s.cancel);

  const [chatInput, setChatInput] = useState('');

  // Floating chat input drag — null = default centered-bottom position.
  const [chatInputPos, setChatInputPos] = useState<{ left: number; top: number } | null>(null);
  const chatInputDragRef = useRef<{ startX: number; startY: number; origLeft: number; origTop: number } | null>(null);
  const chatInputRef = useRef<HTMLFormElement | null>(null);

  const onChatInputDragStart = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = chatInputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    chatInputDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top,
    };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = chatInputDragRef.current;
      if (!d) return;
      setChatInputPos({
        left: d.origLeft + (e.clientX - d.startX),
        top: d.origTop + (e.clientY - d.startY),
      });
    };
    const onUp = () => { chatInputDragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  // Debug toggle for live preview mode (Alt+L cycles 0 → 1 → 2 → 0).
  const [previewMode, setPreviewMode] = useState<LivePreviewMode>(0);

  // Live doc text — updated on every CodeMirror change, used to recompute
  // comments immediately (before the debounced save flushes currentContent).
  const [liveDoc, setLiveDoc] = useState('');

  // Popup state — creation
  const [commentDraft, setCommentDraft] = useState<{
    docFrom: number;
    docTo: number;
    text: string;
    color: HighlightColor;
    screenX: number;
    screenY: number;
  } | null>(null);

  // Popup state — editing an existing highlight
  const [commentEdit, setCommentEdit] = useState<{
    index: number;
    id: string;
    text: string;
    comment: string;
    color: HighlightColor;
    screenX: number;
    screenY: number;
  } | null>(null);

  // Extract all comments from the document — recomputed on every doc edit via
  // `liveDoc`, so the sidebar list stays in sync immediately after
  // create/edit/delete actions (before the debounced save updates currentContent).
  const comments = useMemo<CommentEntry[]>(() => findComments(liveDoc), [liveDoc]);

  // Report comments upstream
  useEffect(() => {
    onCommentsChange(comments);
  }, [comments, onCommentsChange]);

  // Delete the comment at the given index (called from ChatPanel via AppShell).
  // Uses the parsed fullFrom/fullTo range — never a text-based regex — so
  // duplicate highlights cannot be confused with each other.
  deleteCommentRef.current = (index: number) => {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc.toString();
    const list = findComments(doc);
    const c = list[index];
    if (!c) return;
    view.dispatch({
      changes: { from: c.fullFrom, to: c.fullTo, insert: c.text },
    });
  };

  // Update the comment text at the given index (called from ChatPanel via AppShell).
  updateCommentRef.current = (index: number, newComment: string) => {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc.toString();
    const list = findComments(doc);
    const c = list[index];
    if (!c) return;
    const annotation = serializeAnnotation(newComment.trim(), c.color, c.id);
    view.dispatch({
      changes: { from: c.fullFrom, to: c.fullTo, insert: `==${c.text}==${annotation}` },
    });
  };

  // Scroll the editor viewport so the highlight of the comment at `index`
  // is in view and selected. Called when the user clicks a sidebar card.
  scrollToCommentRef.current = (index: number) => {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc.toString();
    const list = findComments(doc);
    const c = list[index];
    if (!c) return;
    view.dispatch({
      selection: { anchor: c.pos, head: c.pos + c.text.length },
      effects: EditorView.scrollIntoView(c.pos, { y: 'center' }),
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
        const idx = comments.findIndex(
          (c) => pos >= c.fullFrom && pos <= c.fullTo,
        );
        if (idx === -1) return;
        const c = comments[idx];
        const coords = v.coordsAtPos(c.pos);
        onCommentSelect(idx);
        setCommentEdit({
          index: idx,
          id: c.id,
          text: c.text,
          comment: c.comment,
          color: c.color as HighlightColor,
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
        // ── Fold gutter ────────────────────────────────────
        foldGutter(),

        // ── Editing behaviour ──────────────────────────────
        history(),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        highlightSpecialChars(),
        highlightTrailingWhitespace(),
        dropCursor(),
        drawSelection(),
        rectangularSelection(),
        EditorState.allowMultipleSelections.of(true),

        // ── Markdown language & folding ────────────────────
        markdown(),
        markdownFoldService,
        codeFolding(),

        // ── Syntax highlighting ────────────────────────────
        noHeadingUnderline,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

        // ── Autocomplete ───────────────────────────────────
        autocompletion({ override: atlasCompletionSources }),

        // ── Linting ────────────────────────────────────────
        linter(markdownLintSource, { delay: 1000 }),

        // ── Live preview ───────────────────────────────────
        livePreviewModeField,
        livePreview,

        // ── Sticky headers ─────────────────────────────────
        stickyHeaderPlugin,

        // ── Keymaps ────────────────────────────────────────
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...foldKeymap,
          ...closeBracketsKeymap,
        ]),

        // ── Misc ───────────────────────────────────────────
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
    // ── Floating toolbar on text selection ──────────────────
    let contextMenuFired = false;
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) return; // right-click → contextmenu handles it
      if (contextMenuFired) {
        contextMenuFired = false;
        return;
      }
      setTimeout(() => {
        const v = viewRef.current;
        if (!v) return;
        const sel = v.state.selection.main;
        if (sel.empty) {
          setMenuPos(null);
          return;
        }
        const coords = v.coordsAtPos(sel.to);
        if (coords) {
          setMenuPos({ x: coords.left + 20, y: coords.bottom + 6 });
        }
      }, 80);
    };
    const onCtx = () => { contextMenuFired = true; };

    view.dom.addEventListener('contextmenu', handleContextMenu);
    view.dom.addEventListener('contextmenu', onCtx);
    view.dom.addEventListener('mouseup', handleMouseUp);

    return () => {
      view.dom.removeEventListener('contextmenu', handleContextMenu);
      view.dom.removeEventListener('contextmenu', onCtx);
      view.dom.removeEventListener('mouseup', handleMouseUp);
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

    setCommentDraft({ docFrom: sel.from, docTo: sel.to, text, color: DEFAULT_HIGHLIGHT_COLOR, screenX, screenY });
  };

  const commitCreate = (comment: string, color: HighlightColor) => {
    const view = viewRef.current;
    if (!view || !commentDraft) return;
    const annotation = serializeAnnotation(comment.trim(), color, genCommentId());
    view.dispatch({
      changes: {
        from: commentDraft.docFrom,
        to: commentDraft.docTo,
        insert: `==${commentDraft.text}==${annotation}`,
      },
    });
    setCommentDraft(null);
  };

  const commitEdit = (comment: string, color: HighlightColor) => {
    const view = viewRef.current;
    if (!view || !commentEdit) return;
    // Re-parse the doc so we get the up-to-date range for this comment's id.
    // Falls back to the captured index if the id is no longer present
    // (e.g. the user just edited the markup manually).
    const doc = view.state.doc.toString();
    const list = findComments(doc);
    const c =
      list.find((entry) => entry.id === commentEdit.id) ?? list[commentEdit.index];
    if (!c) {
      setCommentEdit(null);
      return;
    }
    const annotation = serializeAnnotation(comment.trim(), color, c.id);
    view.dispatch({
      changes: {
        from: c.fullFrom,
        to: c.fullTo,
        insert: `==${c.text}==${annotation}`,
      },
    });
    setCommentEdit(null);
  };

  const deleteFromEdit = () => {
    const view = viewRef.current;
    if (!view || !commentEdit) return;
    const doc = view.state.doc.toString();
    const list = findComments(doc);
    const c =
      list.find((entry) => entry.id === commentEdit.id) ?? list[commentEdit.index];
    if (!c) {
      setCommentEdit(null);
      return;
    }
    view.dispatch({
      changes: { from: c.fullFrom, to: c.fullTo, insert: c.text },
    });
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

  const startRename = () => {
    if (!currentPath) return;
    setRenameDraft(currentPath);
    setRenaming(true);
  };

  const submitRename = async () => {
    if (!currentPath || !renameDraft.trim()) return;
    const newName = renameDraft.trim();
    if (newName === currentPath) {
      setRenaming(false);
      return;
    }
    try {
      await api.vault.rename(currentPath, newName);
      const loadTree = useVaultStore.getState().loadTree;
      await loadTree();
      const openPage = useVaultStore.getState().openPage;
      await openPage(newName);
    } catch (err) {
      console.error('Falha ao renomear:', err);
    }
    setRenaming(false);
  };

  const handleDelete = async () => {
    if (!currentPath) return;
    const name = currentPath.split('/').pop() || currentPath;
    if (!window.confirm(`Tem certeza que deseja apagar "${name}"?`)) return;
    try {
      await api.vault.delete(currentPath);
      useVaultStore.setState({ currentPath: null, currentContent: '', dirty: false });
      const loadTree = useVaultStore.getState().loadTree;
      await loadTree();
    } catch (err) {
      console.error('Falha ao apagar:', err);
    }
  };

  const sendPageToAtlas = () => {
    if (!currentPath) return;
    const chatStore = useChatStore.getState();
    chatStore.loadPageContext(currentPath);
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

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || streaming) return;
    setChatInput('');
    void sendChat(text);
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit(e as unknown as React.FormEvent);
    }
  };

  const addHighlightWithColor = (color: HighlightColor) => {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    const text = view.state.sliceDoc(sel.from, sel.to) || 'texto';
    const annotation = serializeAnnotation('', color, genCommentId());
    view.dispatch({
      changes: {
        from: sel.from,
        to: sel.to,
        insert: `==${text}==${annotation}`,
      },
    });
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
    const IMAGE = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="14" height="10" rx="2"/><circle cx="5" cy="6.5" r="1.5"/><path d="M1 11l4-4 3 3 2-2 5 5"/></svg>`;
    const TABLE = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="14" height="14" rx="1"/><line x1="1" y1="5" x2="15" y2="5"/><line x1="1" y1="9" x2="15" y2="9"/><line x1="5" y1="1" x2="5" y2="15"/><line x1="10" y1="1" x2="10" y2="15"/></svg>`;
    const CHECKBOX = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="1.5" width="13" height="13" rx="2"/><polyline points="5 8 7 10 11 6"/></svg>`;
    const CODEBLOCK = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 5 1 8 4 11"/><polyline points="12 5 15 8 12 11"/><line x1="8" y1="3" x2="8" y2="13"/></svg>`;

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
      { type: 'item', label: 'Bloco de código', icon: CODEBLOCK, shortcut: '```', onSelect: () => insertCodeBlock(view) },
      { type: 'separator' },
      { type: 'item', label: 'Link',     icon: LINK, shortcut: '[]()',  onSelect: () => insertLink(view) },
      { type: 'item', label: 'Imagem',   icon: IMAGE, shortcut: '![]()', onSelect: () => insertImage(view) },
      { type: 'separator' },
      { type: 'item', label: 'Citação',  icon: QUOTE, shortcut: '>',    onSelect: () => toggleLinePrefix(view, '>') },
      { type: 'item', label: 'Lista',    icon: LIST, shortcut: '-',     onSelect: () => toggleLinePrefix(view, '-') },
      { type: 'item', label: 'Checkbox', icon: CHECKBOX, shortcut: '- [ ]', onSelect: () => insertCheckbox(view) },
      { type: 'item', label: 'Régua',    icon: HR, shortcut: '---',     onSelect: () => insertHorizontalRule(view) },
      { type: 'item', label: 'Tabela',   icon: TABLE, onSelect: () => insertTable(view) },
      { type: 'separator' },
      { type: 'item', label: 'Aumentar recuo', icon: INDENT, shortcut: 'Tab',  onSelect: () => changeIndent(view, 2) },
      { type: 'item', label: 'Diminuir recuo', icon: OUTDENT, shortcut: 'Shift+Tab', onSelect: () => changeIndent(view, -2) },
      { type: 'separator' },
      {
        type: 'submenu',
        label: 'Destacar',
        icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11L2 14M4 10L7 7M9 6l3-3M6 12l5-5M3 9l5-5"/><rect x="8.5" y="0.5" width="5" height="5" rx="1" transform="rotate(45 11 3)"/></svg>`,
        children: HIGHLIGHT_COLORS.map((hc) => ({
          type: 'item' as const,
          label: hc.name,
          icon: `<span style="display:inline-block;width:14px;height:14px;border-radius:3px;background-color:${hc.light};border:1px solid ${hc.border}"></span>`,
          onSelect: () => addHighlightWithColor(hc.value),
        })),
      },
      { type: 'item', label: 'Comentário', icon: COMMENT, onSelect: addComment },
      { type: 'item', label: 'Formatar', icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="4" x2="11" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="8" y2="12"/><polyline points="12 10 14 8 12 6"/></svg>`, onSelect: formatDocument },
    ];
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-1.5 border-b border-border flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              onBlur={() => void submitRename()}
              onClick={(e) => e.stopPropagation()}
              className="ml-2 flex-1 text-xs px-2 py-0.5 border border-primary bg-card text-foreground rounded outline-none"
            />
          ) : (
            <>
              <span className="truncate ml-2">{currentPath ?? 'Nenhuma página selecionada'}</span>
              {currentPath && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={sendPageToAtlas}
                    className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-primary transition-colors"
                    title="Adicionar página ao Atlas"
                    aria-label="Adicionar página ao Atlas"
                  >
                    <SendIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={startRename}
                    className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                    title="Renomear"
                    aria-label="Renomear"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => void handleDelete()}
                    className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-destructive transition-colors"
                    title="Apagar"
                    aria-label="Apagar"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onSetTab(chatTab === 'comments' ? 'chat' : 'comments')}
            className={`p-1.5 rounded transition-colors shrink-0 ${
              chatTab === 'comments'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
            title={`Comentários${commentCount > 0 ? ` (${commentCount})` : ''}`}
          >
            <ChatIcon className="w-4 h-4 shrink-0" />
          </button>
          <button
            onClick={formatDocument}
            title="Formatar Markdown"
            className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <FormatIcon className="w-4 h-4" />
          </button>
          <select
            value={fontFamily ?? ''}
            onChange={(e) => void updateSettings({ fontFamily: e.target.value || null })}
            title="Fonte do editor"
            className="text-xs px-1 py-0.5 border border-input bg-card text-foreground rounded focus:outline-none focus:border-primary max-w-[120px] cursor-pointer"
          >
            <option value="">Fonte do sistema</option>
            <option value="Inter">Inter</option>
            <option value="Roboto">Roboto</option>
            <option value="Lora">Lora</option>
            <option value="Merriweather">Merriweather</option>
            <option value="Source Serif 4">Source Serif 4</option>
            <option value="IBM Plex Sans">IBM Plex Sans</option>
            <option value="IBM Plex Serif">IBM Plex Serif</option>
            <option value="Noto Sans">Noto Sans</option>
            <option value="Noto Serif">Noto Serif</option>
            <option value="JetBrains Mono">JetBrains Mono</option>
            <option value="Fira Code">Fira Code</option>
            <option value="Space Grotesk">Space Grotesk</option>
          </select>
          <span className="flex items-center gap-1.5 text-xs tabular-nums">
            {dirty ? (
              <>
                <span className="save-dot-saving" />
                Salvando…
              </>
            ) : (
              <>
                <span className="save-dot-saved" />
                Salvo
              </>
            )}
          </span>
          <button
            onClick={() => {
              const view = viewRef.current;
              if (!view) return;
              const current = view.state.field(livePreviewModeField);
              const next: LivePreviewMode = current === 0 ? 1 : current === 1 ? 2 : 0;
              view.dispatch({ effects: setLivePreviewMode.of(next) });
              setPreviewMode(next);
            }}
            className={`p-1.5 rounded transition-colors shrink-0 ${
              previewMode === 0
                ? 'text-muted-foreground hover:text-foreground hover:bg-accent'
                : 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/30'
            }`}
            title={`Preview: ${previewMode === 0 ? 'Full' : previewMode === 1 ? 'Syntax only' : 'Off'} — clica pra ciclar`}
          >
            <span className={`relative inline-flex items-center ${previewMode === 2 ? 'atlas-eye-off' : ''}`}>
              <EyeIcon className="w-4 h-4" />
            </span>
            {previewMode !== 0 && (
              <span className="text-[10px] ml-1 tabular-nums">{previewMode}</span>
            )}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto relative">
        <div ref={hostRef} className="absolute inset-0" />
        {currentPath === null && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm gap-4">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <svg className="w-6 h-6 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <p className="text-sm text-muted-foreground max-w-[220px] text-center leading-relaxed">
              Selecione ou crie um arquivo para começar a editar
            </p>
          </div>
        )}
        {/* Floating chat input */}
        {chatTab === 'chat' && (
          <form
            ref={chatInputRef}
            onSubmit={handleChatSubmit}
            className="fixed z-50 w-[min(560px,92%)] flex items-center gap-2 p-2 bg-card border border-border rounded-2xl shadow-lg focus-within:border-primary/50 transition-colors"
            style={chatInputPos
              ? { left: chatInputPos.left, top: chatInputPos.top }
              : { left: '50%', bottom: '0.75rem', transform: 'translateX(-50%)' }}
          >
            {/* Drag grip — sits just above the input */}
            <button
              type="button"
              onMouseDown={onChatInputDragStart}
              onDoubleClick={() => setChatInputPos(null)}
              className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center justify-center w-7 h-5 cursor-grab active:cursor-grabbing rounded-md bg-card border border-border shadow-md text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent transition-colors"
              title="Arraste para mover · duplo-clique para redefinir"
              aria-label="Mover input"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                <circle cx="9" cy="6" r="1.4" />
                <circle cx="15" cy="6" r="1.4" />
                <circle cx="9" cy="12" r="1.4" />
                <circle cx="15" cy="12" r="1.4" />
                <circle cx="9" cy="18" r="1.4" />
                <circle cx="15" cy="18" r="1.4" />
              </svg>
            </button>
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              placeholder="Escreva uma mensagem…"
              rows={2}
              className="flex-1 resize-none text-sm px-3 py-2 border border-input bg-background text-foreground rounded-xl focus:outline-none focus:border-primary placeholder:text-muted-foreground/60"
            />
            {streaming ? (
              <button
                type="button"
                onClick={() => void cancelChat()}
                className="px-4 py-2 bg-destructive/10 text-destructive rounded-xl text-sm font-medium hover:bg-destructive/20 transition-colors shrink-0"
              >
                Parar
              </button>
            ) : (
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:brightness-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
              >
                Enviar
              </button>
            )}
          </form>
        )}
      </div>

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
          initialColor={commentDraft.color}
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
          initialColor={commentEdit.color}
          position={{ x: commentEdit.screenX, y: commentEdit.screenY }}
          onSave={commitEdit}
          onCancel={() => setCommentEdit(null)}
          onDelete={deleteFromEdit}
        />
      )}
    </div>
  );
};

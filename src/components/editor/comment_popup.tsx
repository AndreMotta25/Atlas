import { useEffect, useRef, useState } from 'react';
import { HIGHLIGHT_COLORS, DEFAULT_HIGHLIGHT_COLOR, type HighlightColor } from '../../types';

interface CommentPopupProps {
  highlightText: string;
  initialComment?: string;
  initialColor?: HighlightColor;
  mode: 'create' | 'edit';
  position: { x: number; y: number };
  onSave: (comment: string, color: HighlightColor) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const POPUP_WIDTH = 320;
const POPUP_HEIGHT = 280;

export const CommentPopup: React.FC<CommentPopupProps> = ({
  highlightText,
  initialComment = '',
  initialColor = DEFAULT_HIGHLIGHT_COLOR,
  mode,
  position,
  onSave,
  onCancel,
  onDelete,
}) => {
  const [comment, setComment] = useState(initialComment);
  const [color, setColor] = useState<HighlightColor>(initialColor);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const t = textareaRef.current;
    if (!t) return;
    t.focus();
    t.select();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onSave(comment.trim(), color);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [comment, color, onCancel, onSave]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const popup = document.getElementById('comment-popup');
      if (popup && !popup.contains(e.target as Node)) onCancel();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [onCancel]);

  // Clamp position to viewport so the popup never overflows
  const x = Math.max(8, Math.min(position.x, window.innerWidth - POPUP_WIDTH - 8));
  const y = Math.max(8, Math.min(position.y, window.innerHeight - POPUP_HEIGHT - 8));

  const handleSave = () => {
    const trimmed = comment.trim();
    onSave(trimmed, color);
  };

  return (
    // Backdrop transparent only to capture outside clicks — visually invisible
    <div className="fixed inset-0 z-50">
      <div
        id="comment-popup"
        className="absolute bg-card border border-border rounded-lg shadow-2xl flex flex-col"
        style={{ left: x, top: y, width: POPUP_WIDTH }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3 py-2 border-b border-border">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            {mode === 'create' ? 'Novo comentário' : 'Editar comentário'}
          </span>
          <p className="text-[11px] text-muted-foreground bg-muted rounded px-2 py-1.5 italic mt-1.5 line-clamp-3 break-words">
            &ldquo;{highlightText}&rdquo;
          </p>
        </div>

        {/* Body */}
        <div className="p-3 flex flex-col gap-2.5">
          <textarea
            ref={textareaRef}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Escreva seu comentário…"
            rows={3}
            className="w-full resize-none text-sm px-2 py-1.5 border border-input bg-background text-foreground rounded focus:outline-none focus:border-primary"
          />
          {/* Color picker */}
          <div>
            <span className="text-[10px] text-muted-foreground/70 mb-1.5 block">Cor do destaque</span>
            <div className="flex flex-wrap gap-1.5">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  title={c.name}
                  className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${
                    color === c.value ? 'border-primary scale-110 ring-2 ring-primary/30' : 'border-border hover:border-muted-foreground'
                  }`}
                  style={{ backgroundColor: c.light }}
                />
              ))}
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground/70">
            Enter para nova linha · Ctrl+Enter salva · Esc cancela
          </span>
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-border flex items-center justify-between">
          <div>
            {mode === 'edit' && onDelete && (
              <button
                onClick={onDelete}
                title="Apagar comentário"
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-destructive transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1 bg-primary text-primary-foreground text-xs rounded hover:brightness-90 transition-all"
            >
              {mode === 'create' ? (comment.trim() ? 'Salvar' : 'Destacar') : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

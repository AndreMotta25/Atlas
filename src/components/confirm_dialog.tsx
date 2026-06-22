import { useCallback, useRef, useState } from 'react';

/**
 * In-app confirmation modal — replacement for `window.confirm()`.
 *
 * Why not window.confirm():
 *   Electron's native `window.confirm()` shows an OS-level dialog that
 *   steals focus from the BrowserWindow. When it closes, Chromium can
 *   leave `contenteditable` elements (CodeMirror) in a state where
 *   clicks don't register until a full reflow (minimize/restore). By
 *   staying inside the renderer process, this modal avoids the issue
 *   entirely and keeps visual style consistent with the rest of the app.
 */

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-scale-in"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-border">
          <h2 id="confirm-dialog-title" className="text-sm font-semibold text-foreground">
            {title}
          </h2>
        </div>
        <div className="px-4 py-4">
          <p id="confirm-dialog-message" className="text-xs text-muted-foreground leading-relaxed">
            {message}
          </p>
        </div>
        <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2 bg-muted/20">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className={`px-3 py-1.5 text-xs rounded font-medium transition-all ${
              danger
                ? 'bg-destructive text-primary-foreground hover:brightness-90'
                : 'bg-primary text-primary-foreground hover:brightness-90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState extends Required<ConfirmOptions> {
  resolve: (value: boolean) => void;
}

/**
 * Hook that exposes a `confirm()` function returning a Promise<boolean>.
 * Render the returned JSX in your component tree:
 *
 *   const { confirm, dialog } = useConfirm();
 *   const ok = await confirm({ title: 'Apagar?', message: '...', danger: true });
 *   return (<>{dialog}</>);
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Confirmar',
        cancelLabel: opts.cancelLabel ?? 'Cancelar',
        danger: opts.danger ?? false,
        resolve,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state?.resolve(true);
    setState(null);
  }, [state]);

  const handleCancel = useCallback(() => {
    state?.resolve(false);
    setState(null);
  }, [state]);

  const dialog = state ? (
    <ConfirmDialog
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      danger={state.danger}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { confirm, dialog };
}

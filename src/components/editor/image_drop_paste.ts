import { EditorView, ViewPlugin, type PluginValue } from '@codemirror/view';
import { api } from '../../lib/api';

const IMAGE_URL_RE = /^https?:\/\/[^\s]+\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?[^\s]*)?$/i;

interface ImageItem {
  kind: 'file' | 'url' | 'data';
  /** For 'file': the absolute path on disk. For 'url': the http(s) URL. For 'data': a base64 data URL. */
  payload: string;
  /** File extension hint (no dot). */
  ext: string;
}

/** Read a Blob/File as base64 (without the data: prefix). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => {
      const result = fr.result as string;
      // result is "data:<mime>;base64,...."
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    fr.readAsDataURL(blob);
  });
}

/** Extract the first loadable image item from a paste/drop DataTransfer. */
async function extractImageItem(dt: DataTransfer): Promise<ImageItem | null> {
  // 1. Local file (drag from Explorer)
  if (dt.files && dt.files.length > 0) {
    const file = dt.files[0];
    if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(file.name)) {
      try {
        const absPath = api.getPathForFile(file);
        if (absPath) {
          const ext = (file.name.split('.').pop() ?? 'png').toLowerCase();
          return { kind: 'file', payload: absPath, ext };
        }
      } catch {
        // fall through — try buffer path
      }
      // Fallback: read as buffer (e.g. when path isn't available)
      const base64 = await blobToBase64(file);
      const ext = (file.name.split('.').pop() ?? file.type.split('/')[1] ?? 'png').toLowerCase();
      return { kind: 'data', payload: base64, ext };
    }
  }

  // 2. Image blob from clipboard (screenshot, "Copy image" from browser)
  if (dt.items && dt.items.length > 0) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const base64 = await blobToBase64(file);
          const ext = (file.type.split('/')[1] ?? 'png').toLowerCase();
          return { kind: 'data', payload: base64, ext };
        }
      }
    }
  }

  // 3. URL — dragged image from a web page (text/uri-list) or plain text URL
  const url =
    dt.getData('text/uri-list') ||
    dt.getData('text/x-moz-url').split('\n')[0] ||
    dt.getData('text/plain');
  if (url && IMAGE_URL_RE.test(url.trim())) {
    const ext = (url.split('.').pop() ?? 'png').split(/[?#]/)[0].toLowerCase();
    return { kind: 'url', payload: url.trim(), ext };
  }

  return null;
}

/** Resolve an ImageItem into a vault-relative path by calling IPC. */
async function importImageItem(item: ImageItem): Promise<string | null> {
  if (item.kind === 'file') {
    const r = await api.image.importFromPath(item.payload);
    return r.success && r.relPath ? r.relPath : null;
  }
  if (item.kind === 'url') {
    const r = await api.image.downloadFromUrl(item.payload);
    return r.success && r.relPath ? r.relPath : null;
  }
  // data buffer
  const r = await api.image.saveBuffer({ ext: item.ext, base64: item.payload });
  return r.success && r.relPath ? r.relPath : null;
}

/** Insert an image markdown `![alt](relPath)` at the given position. */
function insertMarkdown(view: EditorView, pos: number, relPath: string, alt = 'imagem'): void {
  const text = `![${alt}](${relPath})`;
  view.dispatch({
    changes: { from: pos, to: pos, insert: text },
    selection: { anchor: pos + text.length },
  });
  view.focus();
}

/**
 * CodeMirror extension that wires `paste` and `drop` DOM events on the editor
 * content area. When an image is detected, it is saved to `anexos/` via IPC and
 * the markdown reference is inserted at the cursor (or drop location).
 */
export function imageDropAndPaste(): ReturnType<typeof ViewPlugin.fromClass> {
  return ViewPlugin.fromClass(
    class implements PluginValue {
      private pasteHandler = async (event: ClipboardEvent) => {
        if (!event.clipboardData) return;
        const item = await extractImageItem(event.clipboardData);
        if (!item) return;
        event.preventDefault();
        const view = this.view;
        const relPath = await importImageItem(item);
        if (!relPath) return;
        const sel = view.state.selection.main;
        insertMarkdown(view, sel.from, relPath);
      };

      private dropHandler = async (event: DragEvent) => {
        if (!event.dataTransfer) return;
        const item = await extractImageItem(event.dataTransfer);
        if (!item) return;
        event.preventDefault();
        const view = this.view;
        const dropPos = event.dataTransfer && view.posAtCoords
          ? view.posAtCoords({ x: event.clientX, y: event.clientY })
          : view.state.selection.main.from;
        const pos = dropPos ?? view.state.selection.main.from;
        const relPath = await importImageItem(item);
        if (!relPath) return;
        insertMarkdown(view, pos, relPath);
      };

      update() {
        // no-op — handlers attached in constructor
      }

      constructor(public view: EditorView) {
        view.contentDOM.addEventListener('paste', this.pasteHandler as EventListener);
        view.contentDOM.addEventListener('drop', this.dropHandler as EventListener);
      }

      destroy() {
        this.view.contentDOM.removeEventListener('paste', this.pasteHandler as EventListener);
        this.view.contentDOM.removeEventListener('drop', this.dropHandler as EventListener);
      }
    },
  );
}

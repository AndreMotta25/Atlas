import { WidgetType } from '@codemirror/view';

/**
 * Block widget that replaces an inline image markdown node (`![alt](src)`)
 * with a real `<img>` element.
 *
 * The `src` passed in must already be the URL the browser should load:
 *   - vault-relative paths (`anexos/foo.png`) become `atlas-img://anexos/foo.png`
 *   - `https:` / `data:` / `blob:` are forwarded as-is (CSP allows them)
 *
 * Use {@link resolveImageSrc} to convert a raw markdown URL into a loadable src.
 */
export class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }

  toDOM(): HTMLElement {
    const img = document.createElement('img');
    img.src = this.src;
    img.alt = this.alt;
    img.className = 'atlas-img-rendered';
    img.loading = 'lazy';
    img.draggable = false;
    console.log('[ImageWidget] toDOM src=', this.src);
    img.addEventListener('error', () => {
      console.error('[ImageWidget] failed to load:', this.src);
    });
    img.addEventListener('load', () => {
      console.log('[ImageWidget] loaded:', this.src, 'natural=', img.naturalWidth, 'x', img.naturalHeight);
    });
    return img;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Convert a raw markdown image URL into a value the `<img>` can load:
 *   - `atlas-img://` is used for vault-relative paths (no scheme, no leading slash)
 *   - absolute URLs (`https:`, `http:`, `data:`, `blob:`) are returned untouched
 *   - Windows drive letters (`C:\...`) are treated as local and routed through atlas-img
 */
export function resolveImageSrc(raw: string): string {
  const trimmed = raw.trim();
  if (/^(https?:|data:|blob:|atlas-img:)/i.test(trimmed)) return trimmed;
  // Strip any leading ./ or .\ or slashes — atlas-img:// expects a path relative to vault root
  const rel = trimmed.replace(/^([/\\])/, '').replace(/^\.\//, '').replace(/^\.\\/, '');
  // atlas-img host + path: encode each segment but keep slashes
  return `atlas-img://${rel}`;
}

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useSettingsStore } from '../stores/settings_store';

const FONT_STYLE_ID = 'atlas-google-font';
const CSS_VAR = '--app-font-family';

const SANS_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF_STACK = "Georgia, Cambria, 'Times New Roman', Times, serif";
const MONO_STACK =
  "'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace";

const SERIF_FONTS = new Set(['Lora', 'Merriweather', 'Source Serif 4', 'IBM Plex Serif', 'Noto Serif']);
const MONO_FONTS = new Set(['JetBrains Mono', 'Fira Code']);

function fallbackFor(family: string): string {
  if (MONO_FONTS.has(family)) return MONO_STACK;
  if (SERIF_FONTS.has(family)) return SERIF_STACK;
  return SANS_STACK;
}

/**
 * Applies the configured Google Font to the whole app.
 *
 * Loading strategy is CSP-proof: the renderer cannot fetch cross-origin
 * stylesheets/fonts (renderer CSP blocks them), so the actual fetch happens
 * in the main process (`font:load` IPC), which returns the Google Fonts CSS
 * with every `.woff2` inlined as a `data:` URI. We inject that as an inline
 * `<style>` (`'unsafe-inline'` is allowed) and set `--app-font-family`.
 *
 * The per-category fallback stack ensures a visible change even if the webfont
 * fails to load — picking "JetBrains Mono" renders in OS monospace, not the
 * default sans-serif.
 */
export const useFont = (): void => {
  const fontFamily = useSettingsStore((s) => s.settings.fontFamily);
  const [fontCss, setFontCss] = useState<string | null>(null);
  const loadedFamily = useRef<string | null>(null);

  // Fetch + inline the webfont CSS whenever the family changes.
  useEffect(() => {
    const family = fontFamily?.trim() || null;
    if (!family) {
      setFontCss(null);
      loadedFamily.current = null;
      return;
    }
    if (loadedFamily.current === family) return; // already loaded
    let cancelled = false;
    void api.font.load(family).then((res) => {
      if (cancelled) return;
      if (res.success && res.css) {
        loadedFamily.current = family;
        setFontCss(res.css);
      }
      // On error we keep fontCss null — the fallback stack still applies.
    });
    return () => { cancelled = true; };
  }, [fontFamily]);

  // Apply CSS var + body font + inject/remove the <style> tag.
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const family = fontFamily?.trim() || null;
    const value = !family ? SANS_STACK : `'${family}', ${fallbackFor(family)}`;

    root.style.setProperty(CSS_VAR, value);
    if (body) body.style.fontFamily = value;

    let tag = document.getElementById(FONT_STYLE_ID);
    if (fontCss) {
      if (!tag) {
        tag = document.createElement('style');
        tag.id = FONT_STYLE_ID;
        document.head.appendChild(tag);
      }
      tag.textContent = fontCss;
    } else if (tag) {
      tag.remove();
    }
  }, [fontFamily, fontCss]);
};

import { ipcMain } from 'electron';
import * as https from 'https';
import { createChannel } from '../types';

/**
 * Font loader that bypasses the renderer's Content Security Policy.
 *
 * The renderer cannot fetch from fonts.googleapis.com / fonts.gstatic.com
 * directly (CSP blocks cross-origin stylesheet/font fetches, and the effective
 * CSP in this app varies between builds). The main process has no CSP, so it:
 *   1. Fetches the Google Fonts CSS for the requested family.
 *   2. Fetches every referenced .woff2 binary.
 *   3. Inlines each as a `data:` URI inside the CSS.
 * The renderer then injects the result as an inline `<style>` (allowed under
 * `'unsafe-inline'`) — `data:` URIs are allowed under the `data:` source.
 */

const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'text/css,*/*;q=0.1' } },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow one redirect (Google occasionally 302s).
          res.resume();
          fetchText(res.headers.location).then(resolve, reject);
          return;
        }
        if (!res.statusCode || res.statusCode >= 400) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} para ${url}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve(body));
      },
    );
    req.setTimeout(FETCH_TIMEOUT_MS, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function fetchBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchBase64(res.headers.location).then(resolve, reject);
        return;
      }
      if (!res.statusCode || res.statusCode >= 400) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} para ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    });
    req.setTimeout(FETCH_TIMEOUT_MS, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** Replace every url(https://...) in the CSS with an inlined data: URI. */
async function inlineFontUrls(css: string): Promise<string> {
  const urlRegex = /url\((https:\/\/[^)]+\.woff2)\)/g;
  const matches = Array.from(css.matchAll(urlRegex));
  const replacements = await Promise.all(
    matches.map(async (m) => {
      const original = m[1];
      try {
        const b64 = await fetchBase64(original);
        return { original, data: `url(data:font/woff2;base64,${b64})` };
      } catch {
        // Leave the original URL if a single weight fails — partial result is fine.
        return { original, data: m[0] };
      }
    }),
  );
  let out = css;
  for (const r of replacements) {
    out = out.split(`url(${r.original})`).join(r.data);
  }
  return out;
}

export const registerFontHandlers = (): void => {
  ipcMain.handle(createChannel('font', 'load'), async (_e, family: string) => {
    const name = family?.trim();
    if (!name) return { success: false, error: 'Família vazia.' };
    const apiName = name.replace(/\s+/g, '+');
    const cssUrl = `https://fonts.googleapis.com/css2?family=${apiName}:wght@400;600;700&display=swap`;
    try {
      const css = await fetchText(cssUrl);
      const inlined = await inlineFontUrls(css);
      return { success: true, css: inlined };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
};

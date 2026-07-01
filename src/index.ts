import { app, BrowserWindow, dialog, nativeTheme, session, protocol, net } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
import { registerAllHandlers } from './ipc';
import { createChannel } from './types';
import { ConfigStore } from './vault/config_store';
import { initVaultFromConfig, VaultManager } from './vault/manager';
import { DatabaseService } from './vault/db';
import { Indexer } from './vault/indexer';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Register the atlas-img:// scheme as privileged BEFORE app.whenReady().
// Required so Electron treats it as a standard, secure, fetch-capable scheme.
// Without this, protocol.handle would still respond but CSP/CORS and the
// <img> loading pipeline would reject it.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'atlas-img',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

const ALLOWED_PERMISSIONS = ['notifications', 'clipboard-read'];

if (require('electron-squirrel-startup')) {
  app.quit();
}

const getWindowIcon = (): string => {
  const file = app.isPackaged
    ? path.join(process.resourcesPath, 'build', 'icon.ico')
    : path.join(__dirname, '..', '..', 'build', 'icon.ico');
  return file;
};

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    height: 600,
    width: 800,
    show: false,
    icon: getWindowIcon(),
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      disableBlinkFeatures: 'Auxclick',
    },
  });

  console.log('[main] loading URL:', MAIN_WINDOW_WEBPACK_ENTRY);

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Forward renderer console messages to main process
  mainWindow.webContents.on('console-message', (_event, level, message) => {
    console.log(`[renderer:${level}] ${message}`);
  });

  // Navigation guard — only allow file:// loads
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Block DevTools in production
  if (process.env.NODE_ENV !== 'development') {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12') event.preventDefault();
    });
  }
};

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    registerAllHandlers();

    // Custom protocol that serves image files from the current vault root.
    // Renderer references images as `atlas-img://anexos/foo.png` — the handler
    // resolves the relative path against VaultManager.getRoot() and streams the
    // bytes via net.fetch. Path traversal is blocked (abs must remain inside root).
    protocol.handle('atlas-img', async (request) => {
      const root = VaultManager.getRoot();
      console.log('[atlas-img] request:', request.url, 'root:', root);
      if (!root) return new Response('vault not configured', { status: 404 });
      const u = new URL(request.url);
      // host holds the first segment; pathname the rest. Decode both.
      const relPath = decodeURIComponent(`${u.host}${u.pathname}`);
      const abs = path.resolve(root, relPath);
      console.log('[atlas-img] resolved abs:', abs);
      if (abs !== root && !abs.startsWith(root + path.sep)) {
        console.warn('[atlas-img] forbidden (outside vault root)');
        return new Response('forbidden', { status: 403 });
      }
      try {
        const fileUrl = pathToFileURL(abs).toString();
        const res = await net.fetch(fileUrl);
        console.log('[atlas-img] fetch ok, status:', res.status, 'size:', res.headers.get('content-length'));
        return res;
      } catch (err) {
        console.error('[atlas-img] fetch failed:', err);
        return new Response('not found', { status: 404 });
      }
    });

    try {
      DatabaseService.open();
    } catch (err) {
      console.error('[main] failed to open database:', err);
      const message = err instanceof Error ? err.message : String(err);
      dialog.showErrorBox(
        'Atlas — Database error',
        `Failed to open the local index database.\n\n${message}\n\n` +
          `If this is the first run, check that %APPDATA%\\atlas is writable ` +
          `and not blocked by antivirus or Windows Controlled Folder Access.`,
      );
      app.quit();
      return;
    }

    // Restore persisted theme.
    const saved = ConfigStore.load().themeMode ?? 'system';
    nativeTheme.themeSource = saved;

    // Forward OS theme changes to all windows (for system mode).
    nativeTheme.on('updated', () => {
      BrowserWindow.getAllWindows().forEach((w) => {
        w.webContents.send(
          createChannel('theme', 'changed'),
          nativeTheme.shouldUseDarkColors,
        );
      });
    });

    // Restore persisted vault path and kick off a full reindex.
    const persistedVault = ConfigStore.load().vaultPath;
    initVaultFromConfig(persistedVault);
    if (persistedVault) {
      try {
        await Indexer.reindexAll();
      } catch (err) {
        console.error('[main] initial reindex failed:', err);
      }
    }

    // Permission handler
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(ALLOWED_PERMISSIONS.includes(permission));
    });

    createWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  VaultManager.stopWatch();
  DatabaseService.close();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

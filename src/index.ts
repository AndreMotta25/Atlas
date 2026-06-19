import { app, BrowserWindow, nativeTheme, session } from 'electron';
import { registerAllHandlers } from './ipc';
import { createChannel } from './types';
import { ConfigStore } from './vault/config_store';
import { initVaultFromConfig, VaultManager } from './vault/manager';
import { DatabaseService } from './vault/db';
import { Indexer } from './vault/indexer';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

const ALLOWED_PERMISSIONS = ['notifications', 'clipboard-read'];

if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    height: 600,
    width: 800,
    show: false,
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

    // Open the SQLite index DB before any vault work touches it.
    DatabaseService.open();

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

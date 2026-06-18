---
name: electron-native-apis
description: >
  Use esta skill ao implementar funcionalidades nativas de desktop em Electron: instância única
  (requestSingleInstanceLock), auto-atualização (update-electron-app ou electron-updater),
  deep links / protocol handler (setAsDefaultProtocolClient), tema do sistema (nativeTheme dark/light),
  monitoramento de energia (powerMonitor sleep/wake/battery), ícone na bandeja do sistema (Tray),
  atalhos globais de teclado (globalShortcut), notificações nativas do OS (Notification) e caminhos
  corretos por plataforma (app.getPath). Acione quando o usuário mencionar qualquer um desses termos
  ou pedir funcionalidades típicas de apps desktop nativos.
compatibility: "Electron 20+ com TypeScript"
license: Proprietary
---

# Electron Native APIs

---

## 1. Single Instance Lock

Garante que apenas uma instância do app rode. Segunda instância foca a janela existente.

```typescript
// src/index.ts — ANTES de app.whenReady()
import { app, BrowserWindow } from "electron";

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Esta é uma segunda instância — sair imediatamente
  app.quit();
} else {
  // Esta é a instância primária
  app.on("second-instance", (_event, commandLine, _workingDirectory) => {
    // Focar a janela existente quando segunda instância tenta abrir
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }

    // commandLine contém args da segunda instância
    // Útil para deep links no Windows (ver seção 3)
    const url = commandLine.find((arg) => arg.startsWith("myapp://"));
    if (url) handleDeepLink(url);
  });

  app.whenReady().then(() => {
    createWindow();
  });
}
```

---

## 2. Auto-Update

### Opção A — `update-electron-app` (mais simples, usa update.electronjs.org)

Requisitos: app no GitHub com releases públicas, app assinado no macOS.

```bash
npm install update-electron-app
```

```typescript
// src/index.ts
import { updateElectronApp, UpdateSourceType } from "update-electron-app";

app.whenReady().then(() => {
  updateElectronApp({
    updateSource: {
      type: UpdateSourceType.ElectronPublicUpdateService,
      repo: "seu-usuario/seu-repo", // GitHub: usuario/repo
    },
    updateInterval: "1 hour",
    notifyUser: true, // dialog nativo de "atualização disponível"
  });

  createWindow();
});
```

### Opção B — `electron-updater` (mais recursos: Linux, progresso, canais)

```bash
npm install electron-updater
```

```typescript
// src/updater.ts
import { autoUpdater } from "electron-updater";
import { BrowserWindow, ipcMain } from "electron";

export function setupAutoUpdater(win: BrowserWindow) {
  autoUpdater.autoDownload = false; // pedir confirmação antes de baixar

  autoUpdater.on("update-available", (info) => {
    // Notificar renderer
    win.webContents.send("update:available", {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    win.webContents.send("update:progress", {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", () => {
    win.webContents.send("update:downloaded");
  });

  autoUpdater.on("error", (error) => {
    console.error("[updater]", error);
  });

  // Handler para o renderer confirmar o download
  ipcMain.handle("update:download", async () => {
    await autoUpdater.downloadUpdate();
    return { success: true };
  });

  // Handler para instalar e reiniciar
  ipcMain.handle("update:install", () => {
    autoUpdater.quitAndInstall();
  });

  // Verificar na inicialização (evitar no primeiro run do Squirrel)
  const isSquirrelFirstRun = process.argv.includes("--squirrel-firstrun");
  if (!isSquirrelFirstRun) {
    setTimeout(() => autoUpdater.checkForUpdates(), 3000);
  }
}
```

**Expor no preload:**

```typescript
const electronAPI = {
  update: {
    onAvailable: (cb: (info: { version: string }) => void) => {
      const handler = (_e: any, info: any) => cb(info);
      ipcRenderer.on("update:available", handler);
      return () => ipcRenderer.removeListener("update:available", handler);
    },
    onProgress: (cb: (progress: { percent: number }) => void) => {
      const handler = (_e: any, p: any) => cb(p);
      ipcRenderer.on("update:progress", handler);
      return () => ipcRenderer.removeListener("update:progress", handler);
    },
    onDownloaded: (cb: () => void) => {
      ipcRenderer.on("update:downloaded", cb);
      return () => ipcRenderer.removeListener("update:downloaded", cb);
    },
    download: () => ipcRenderer.invoke("update:download"),
    install: () => ipcRenderer.invoke("update:install"),
  },
};
```

---

## 3. Deep Links (Protocol Handler)

Permite abrir o app via URL: `myapp://action/payload`.

### Registrar o protocolo

```typescript
// src/index.ts
const PROTOCOL = "myapp";

// Registrar ANTES de app.whenReady() no macOS/Linux
// No Windows, registrar após o app estar pronto
if (process.defaultApp) {
  // Modo dev: adicionar o executável explicitamente
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}
```

### Tratar deep links

```typescript
// src/index.ts
export function handleDeepLink(url: string) {
  // Validar o protocolo antes de processar
  if (!url.startsWith(`${PROTOCOL}://`)) return;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.error("[deep-link] URL inválida:", url);
    return;
  }

  const action = parsed.hostname; // myapp://ACTION/...
  const payload = parsed.pathname.slice(1); // remover /

  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send("deep-link:received", { action, payload });
    if (win.isMinimized()) win.restore();
    win.focus();
  }
}

// macOS — deep link chega via evento open-url
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Windows/Linux — deep link chega como argumento de linha de comando
// (tratado no second-instance para instância única, ou:)
const deepLinkUrl = process.argv.find((arg) =>
  arg.startsWith(`${PROTOCOL}://`),
);
if (deepLinkUrl) {
  app.whenReady().then(() => handleDeepLink(deepLinkUrl));
}
```

### `forge.config.ts` — registrar protocolo no pacote

```typescript
// forge.config.ts — packagerConfig
packagerConfig: {
  asar: true,
  protocols: [
    {
      name: 'My App',
      schemes: ['myapp'],
    },
  ],
},
```

---

## 4. `nativeTheme` — Dark/Light Mode

```typescript
// src/ipc/theme_handlers.ts
import { ipcMain, nativeTheme } from "electron";
import { BrowserWindow } from "electron";

export function registerThemeHandlers(win: BrowserWindow) {
  // Obter tema atual
  ipcMain.handle("theme:get", () => ({
    isDark: nativeTheme.shouldUseDarkColors,
    themeSource: nativeTheme.themeSource, // 'system' | 'light' | 'dark'
  }));

  // Definir tema manualmente
  ipcMain.handle("theme:set", (_event, source: "system" | "light" | "dark") => {
    nativeTheme.themeSource = source;
    return { isDark: nativeTheme.shouldUseDarkColors };
  });

  // Notificar renderer quando o tema do sistema mudar
  nativeTheme.on("updated", () => {
    win.webContents.send("theme:changed", {
      isDark: nativeTheme.shouldUseDarkColors,
    });
  });
}
```

**Hook no renderer:**

```typescript
// src/hooks/use_theme.ts
import { useState, useEffect } from "react";
import { useElectronAPI } from "./use_electron_api";

export function useTheme() {
  const electronAPI = useElectronAPI();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Obter tema inicial
    electronAPI.theme.get().then(({ isDark }) => setIsDark(isDark));

    // Escutar mudanças do sistema
    const unsub = electronAPI.theme.onChange(({ isDark }) => {
      setIsDark(isDark);
      document.documentElement.classList.toggle("dark", isDark);
    });

    return unsub;
  }, []);

  return { isDark, setTheme: electronAPI.theme.set };
}
```

---

## 5. `powerMonitor` — Energia e Ciclo do Sistema

```typescript
// src/index.ts — configurar após app.whenReady()
import { powerMonitor } from "electron";

function setupPowerMonitor(win: BrowserWindow) {
  // Sistema indo dormir — salvar estado, pausar operações
  powerMonitor.on("suspend", () => {
    console.log("[power] Sistema suspendendo");
    win.webContents.send("power:suspend");
  });

  // Sistema acordando — reconectar serviços
  powerMonitor.on("resume", () => {
    console.log("[power] Sistema resumindo");
    win.webContents.send("power:resume");
  });

  // Tela sendo bloqueada — pausar operações sensíveis
  powerMonitor.on("lock-screen", () => {
    win.webContents.send("power:lock-screen");
  });

  powerMonitor.on("unlock-screen", () => {
    win.webContents.send("power:unlock-screen");
  });

  // Mudança de fonte de energia
  powerMonitor.on("on-battery", () => {
    win.webContents.send("power:battery-mode");
  });

  powerMonitor.on("on-ac", () => {
    win.webContents.send("power:ac-mode");
  });

  // Verificar estado atual
  ipcMain.handle("power:get-status", () => ({
    onBattery: powerMonitor.onBattery,
    thermalState: powerMonitor.getCurrentThermalState?.() ?? "nominal",
  }));
}
```

---

## 6. Tray (Ícone na Bandeja do Sistema)

```typescript
// src/tray.ts
import { Tray, Menu, BrowserWindow, nativeImage, app } from "electron";
import path from "path";

let tray: Tray | null = null;

export function createTray(win: BrowserWindow) {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, "../assets/tray-icon.png"), // 16x16 ou 22x22
  );

  tray = new Tray(icon);
  tray.setToolTip("My Electron App");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Abrir",
      click: () => {
        win.show();
        win.focus();
      },
    },
    { type: "separator" },
    {
      label: "Versão: " + app.getVersion(),
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Clique no ícone mostra/esconde a janela
  tray.on("click", () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });

  return tray;
}

// Para manter o app rodando mesmo após fechar a janela:
// src/index.ts
app.on("window-all-closed", () => {
  // NÃO chamar app.quit() aqui se quiser manter no tray
  // app.quit() só quando o usuário pedir via menu do tray
});
```

---

## 7. `globalShortcut` — Atalhos de Teclado Globais

```typescript
// src/index.ts — registrar após app.whenReady()
import { globalShortcut } from "electron";

function registerGlobalShortcuts(win: BrowserWindow) {
  // Mostrar/esconder janela com atalho global
  const registered = globalShortcut.register("CommandOrControl+Shift+A", () => {
    if (win.isVisible() && win.isFocused()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });

  if (!registered) {
    console.warn("[shortcuts] Falha ao registrar CommandOrControl+Shift+A");
  }
}

// OBRIGATÓRIO: desregistrar ao sair para não vazar o atalho no OS
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
```

> **Atalhos globais continuam ativos mesmo quando o app não está em foco.** Use com parcimônia — conflitos com outros apps são comuns.

---

## 8. `Notification` — Notificações Nativas do OS

```typescript
// src/ipc/notification_handlers.ts
import { ipcMain, Notification } from "electron";
import { z } from "zod";

const notificationSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().max(300).optional(),
  silent: z.boolean().optional().default(false),
});

export function registerNotificationHandlers() {
  ipcMain.handle("notification:show", (_event, request) => {
    // Notificações só funcionam no Main Process
    if (!Notification.isSupported()) {
      return {
        success: false,
        error: "Notificações não suportadas neste sistema",
      };
    }

    try {
      const validated = notificationSchema.parse(request);

      const notification = new Notification({
        title: validated.title,
        body: validated.body,
        silent: validated.silent,
      });

      notification.show();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });
}
```

---

## 9. `app.getPath()` — Caminhos por Plataforma

**Nunca use caminhos hardcoded.** Use sempre `app.getPath()`:

```typescript
import { app } from "electron";

// Caminhos disponíveis:
app.getPath("userData"); // ~/Library/Application Support/MyApp  (macOS)
// %APPDATA%\MyApp                       (Windows)
// ~/.config/MyApp                       (Linux)

app.getPath("temp"); // diretório temporário do OS
app.getPath("downloads"); // pasta Downloads do usuário
app.getPath("documents"); // pasta Documentos do usuário
app.getPath("desktop"); // área de trabalho
app.getPath("logs"); // pasta de logs do app
app.getPath("exe"); // caminho do executável

// Uso prático — banco de dados SQLite
const DB_PATH = path.join(app.getPath("userData"), "database.db");

// Uso prático — arquivo de configurações
const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

// Expor via IPC (renderer não tem acesso a app.getPath diretamente)
ipcMain.handle("app:get-path", (_event, name: string) => {
  const allowed = [
    "userData",
    "temp",
    "downloads",
    "documents",
    "desktop",
    "logs",
  ];
  if (!allowed.includes(name)) return null;
  return app.getPath(name as any);
});
```

---

## Estrutura de pastas sugerida para features nativas

````
src/
├── ipc/
│   ├── credentials_handlers.ts   # safeStorage
│   ├── notification_handlers.ts  # Notification
│   ├── shell_handlers.ts         # shell.openExternal
│   ├── theme_handlers.ts         # nativeTheme
│   └── index.ts
├── tray.ts                        # Tray icon
├── updater.ts                     # Auto-update
└── index.ts                       # Main process
    # registerGlobalShortcuts()
    # setupPowerMonitor()
    # handleDeepLink()
    # Single instance lock
```---
name: electron-native-apis
description: >
  Use esta skill ao implementar funcionalidades nativas de desktop em Electron: instância única
  (requestSingleInstanceLock), auto-atualização (update-electron-app ou electron-updater),
  deep links / protocol handler (setAsDefaultProtocolClient), tema do sistema (nativeTheme dark/light),
  monitoramento de energia (powerMonitor sleep/wake/battery), ícone na bandeja do sistema (Tray),
  atalhos globais de teclado (globalShortcut), notificações nativas do OS (Notification) e caminhos
  corretos por plataforma (app.getPath). Acione quando o usuário mencionar qualquer um desses termos
  ou pedir funcionalidades típicas de apps desktop nativos.
compatibility: "Electron 20+ com TypeScript"
license: Proprietary
---

# Electron Native APIs

---

## 1. Single Instance Lock

Garante que apenas uma instância do app rode. Segunda instância foca a janela existente.

```typescript
// src/index.ts — ANTES de app.whenReady()
import { app, BrowserWindow } from 'electron';

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Esta é uma segunda instância — sair imediatamente
  app.quit();
} else {
  // Esta é a instância primária
  app.on('second-instance', (_event, commandLine, _workingDirectory) => {
    // Focar a janela existente quando segunda instância tenta abrir
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }

    // commandLine contém args da segunda instância
    // Útil para deep links no Windows (ver seção 3)
    const url = commandLine.find(arg => arg.startsWith('myapp://'));
    if (url) handleDeepLink(url);
  });

  app.whenReady().then(() => {
    createWindow();
  });
}
````

---

## 2. Auto-Update

### Opção A — `update-electron-app` (mais simples, usa update.electronjs.org)

Requisitos: app no GitHub com releases públicas, app assinado no macOS.

```bash
npm install update-electron-app
```

```typescript
// src/index.ts
import { updateElectronApp, UpdateSourceType } from "update-electron-app";

app.whenReady().then(() => {
  updateElectronApp({
    updateSource: {
      type: UpdateSourceType.ElectronPublicUpdateService,
      repo: "seu-usuario/seu-repo", // GitHub: usuario/repo
    },
    updateInterval: "1 hour",
    notifyUser: true, // dialog nativo de "atualização disponível"
  });

  createWindow();
});
```

### Opção B — `electron-updater` (mais recursos: Linux, progresso, canais)

```bash
npm install electron-updater
```

```typescript
// src/updater.ts
import { autoUpdater } from "electron-updater";
import { BrowserWindow, ipcMain } from "electron";

export function setupAutoUpdater(win: BrowserWindow) {
  autoUpdater.autoDownload = false; // pedir confirmação antes de baixar

  autoUpdater.on("update-available", (info) => {
    // Notificar renderer
    win.webContents.send("update:available", {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    win.webContents.send("update:progress", {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", () => {
    win.webContents.send("update:downloaded");
  });

  autoUpdater.on("error", (error) => {
    console.error("[updater]", error);
  });

  // Handler para o renderer confirmar o download
  ipcMain.handle("update:download", async () => {
    await autoUpdater.downloadUpdate();
    return { success: true };
  });

  // Handler para instalar e reiniciar
  ipcMain.handle("update:install", () => {
    autoUpdater.quitAndInstall();
  });

  // Verificar na inicialização (evitar no primeiro run do Squirrel)
  const isSquirrelFirstRun = process.argv.includes("--squirrel-firstrun");
  if (!isSquirrelFirstRun) {
    setTimeout(() => autoUpdater.checkForUpdates(), 3000);
  }
}
```

**Expor no preload:**

```typescript
const electronAPI = {
  update: {
    onAvailable: (cb: (info: { version: string }) => void) => {
      const handler = (_e: any, info: any) => cb(info);
      ipcRenderer.on("update:available", handler);
      return () => ipcRenderer.removeListener("update:available", handler);
    },
    onProgress: (cb: (progress: { percent: number }) => void) => {
      const handler = (_e: any, p: any) => cb(p);
      ipcRenderer.on("update:progress", handler);
      return () => ipcRenderer.removeListener("update:progress", handler);
    },
    onDownloaded: (cb: () => void) => {
      ipcRenderer.on("update:downloaded", cb);
      return () => ipcRenderer.removeListener("update:downloaded", cb);
    },
    download: () => ipcRenderer.invoke("update:download"),
    install: () => ipcRenderer.invoke("update:install"),
  },
};
```

---

## 3. Deep Links (Protocol Handler)

Permite abrir o app via URL: `myapp://action/payload`.

### Registrar o protocolo

```typescript
// src/index.ts
const PROTOCOL = "myapp";

// Registrar ANTES de app.whenReady() no macOS/Linux
// No Windows, registrar após o app estar pronto
if (process.defaultApp) {
  // Modo dev: adicionar o executável explicitamente
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}
```

### Tratar deep links

```typescript
// src/index.ts
export function handleDeepLink(url: string) {
  // Validar o protocolo antes de processar
  if (!url.startsWith(`${PROTOCOL}://`)) return;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.error("[deep-link] URL inválida:", url);
    return;
  }

  const action = parsed.hostname; // myapp://ACTION/...
  const payload = parsed.pathname.slice(1); // remover /

  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send("deep-link:received", { action, payload });
    if (win.isMinimized()) win.restore();
    win.focus();
  }
}

// macOS — deep link chega via evento open-url
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Windows/Linux — deep link chega como argumento de linha de comando
// (tratado no second-instance para instância única, ou:)
const deepLinkUrl = process.argv.find((arg) =>
  arg.startsWith(`${PROTOCOL}://`),
);
if (deepLinkUrl) {
  app.whenReady().then(() => handleDeepLink(deepLinkUrl));
}
```

### `forge.config.ts` — registrar protocolo no pacote

```typescript
// forge.config.ts — packagerConfig
packagerConfig: {
  asar: true,
  protocols: [
    {
      name: 'My App',
      schemes: ['myapp'],
    },
  ],
},
```

---

## 4. `nativeTheme` — Dark/Light Mode

```typescript
// src/ipc/theme_handlers.ts
import { ipcMain, nativeTheme } from "electron";
import { BrowserWindow } from "electron";

export function registerThemeHandlers(win: BrowserWindow) {
  // Obter tema atual
  ipcMain.handle("theme:get", () => ({
    isDark: nativeTheme.shouldUseDarkColors,
    themeSource: nativeTheme.themeSource, // 'system' | 'light' | 'dark'
  }));

  // Definir tema manualmente
  ipcMain.handle("theme:set", (_event, source: "system" | "light" | "dark") => {
    nativeTheme.themeSource = source;
    return { isDark: nativeTheme.shouldUseDarkColors };
  });

  // Notificar renderer quando o tema do sistema mudar
  nativeTheme.on("updated", () => {
    win.webContents.send("theme:changed", {
      isDark: nativeTheme.shouldUseDarkColors,
    });
  });
}
```

**Hook no renderer:**

```typescript
// src/hooks/use_theme.ts
import { useState, useEffect } from "react";
import { useElectronAPI } from "./use_electron_api";

export function useTheme() {
  const electronAPI = useElectronAPI();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Obter tema inicial
    electronAPI.theme.get().then(({ isDark }) => setIsDark(isDark));

    // Escutar mudanças do sistema
    const unsub = electronAPI.theme.onChange(({ isDark }) => {
      setIsDark(isDark);
      document.documentElement.classList.toggle("dark", isDark);
    });

    return unsub;
  }, []);

  return { isDark, setTheme: electronAPI.theme.set };
}
```

---

## 5. `powerMonitor` — Energia e Ciclo do Sistema

```typescript
// src/index.ts — configurar após app.whenReady()
import { powerMonitor } from "electron";

function setupPowerMonitor(win: BrowserWindow) {
  // Sistema indo dormir — salvar estado, pausar operações
  powerMonitor.on("suspend", () => {
    console.log("[power] Sistema suspendendo");
    win.webContents.send("power:suspend");
  });

  // Sistema acordando — reconectar serviços
  powerMonitor.on("resume", () => {
    console.log("[power] Sistema resumindo");
    win.webContents.send("power:resume");
  });

  // Tela sendo bloqueada — pausar operações sensíveis
  powerMonitor.on("lock-screen", () => {
    win.webContents.send("power:lock-screen");
  });

  powerMonitor.on("unlock-screen", () => {
    win.webContents.send("power:unlock-screen");
  });

  // Mudança de fonte de energia
  powerMonitor.on("on-battery", () => {
    win.webContents.send("power:battery-mode");
  });

  powerMonitor.on("on-ac", () => {
    win.webContents.send("power:ac-mode");
  });

  // Verificar estado atual
  ipcMain.handle("power:get-status", () => ({
    onBattery: powerMonitor.onBattery,
    thermalState: powerMonitor.getCurrentThermalState?.() ?? "nominal",
  }));
}
```

---

## 6. Tray (Ícone na Bandeja do Sistema)

```typescript
// src/tray.ts
import { Tray, Menu, BrowserWindow, nativeImage, app } from "electron";
import path from "path";

let tray: Tray | null = null;

export function createTray(win: BrowserWindow) {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, "../assets/tray-icon.png"), // 16x16 ou 22x22
  );

  tray = new Tray(icon);
  tray.setToolTip("My Electron App");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Abrir",
      click: () => {
        win.show();
        win.focus();
      },
    },
    { type: "separator" },
    {
      label: "Versão: " + app.getVersion(),
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Clique no ícone mostra/esconde a janela
  tray.on("click", () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });

  return tray;
}

// Para manter o app rodando mesmo após fechar a janela:
// src/index.ts
app.on("window-all-closed", () => {
  // NÃO chamar app.quit() aqui se quiser manter no tray
  // app.quit() só quando o usuário pedir via menu do tray
});
```

---

## 7. `globalShortcut` — Atalhos de Teclado Globais

```typescript
// src/index.ts — registrar após app.whenReady()
import { globalShortcut } from "electron";

function registerGlobalShortcuts(win: BrowserWindow) {
  // Mostrar/esconder janela com atalho global
  const registered = globalShortcut.register("CommandOrControl+Shift+A", () => {
    if (win.isVisible() && win.isFocused()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });

  if (!registered) {
    console.warn("[shortcuts] Falha ao registrar CommandOrControl+Shift+A");
  }
}

// OBRIGATÓRIO: desregistrar ao sair para não vazar o atalho no OS
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
```

> **Atalhos globais continuam ativos mesmo quando o app não está em foco.** Use com parcimônia — conflitos com outros apps são comuns.

---

## 8. `Notification` — Notificações Nativas do OS

```typescript
// src/ipc/notification_handlers.ts
import { ipcMain, Notification } from "electron";
import { z } from "zod";

const notificationSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().max(300).optional(),
  silent: z.boolean().optional().default(false),
});

export function registerNotificationHandlers() {
  ipcMain.handle("notification:show", (_event, request) => {
    // Notificações só funcionam no Main Process
    if (!Notification.isSupported()) {
      return {
        success: false,
        error: "Notificações não suportadas neste sistema",
      };
    }

    try {
      const validated = notificationSchema.parse(request);

      const notification = new Notification({
        title: validated.title,
        body: validated.body,
        silent: validated.silent,
      });

      notification.show();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });
}
```

---

## 9. `app.getPath()` — Caminhos por Plataforma

**Nunca use caminhos hardcoded.** Use sempre `app.getPath()`:

```typescript
import { app } from "electron";

// Caminhos disponíveis:
app.getPath("userData"); // ~/Library/Application Support/MyApp  (macOS)
// %APPDATA%\MyApp                       (Windows)
// ~/.config/MyApp                       (Linux)

app.getPath("temp"); // diretório temporário do OS
app.getPath("downloads"); // pasta Downloads do usuário
app.getPath("documents"); // pasta Documentos do usuário
app.getPath("desktop"); // área de trabalho
app.getPath("logs"); // pasta de logs do app
app.getPath("exe"); // caminho do executável

// Uso prático — banco de dados SQLite
const DB_PATH = path.join(app.getPath("userData"), "database.db");

// Uso prático — arquivo de configurações
const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

// Expor via IPC (renderer não tem acesso a app.getPath diretamente)
ipcMain.handle("app:get-path", (_event, name: string) => {
  const allowed = [
    "userData",
    "temp",
    "downloads",
    "documents",
    "desktop",
    "logs",
  ];
  if (!allowed.includes(name)) return null;
  return app.getPath(name as any);
});
```

---

## Estrutura de pastas sugerida para features nativas

```
src/
├── ipc/
│   ├── credentials_handlers.ts   # safeStorage
│   ├── notification_handlers.ts  # Notification
│   ├── shell_handlers.ts         # shell.openExternal
│   ├── theme_handlers.ts         # nativeTheme
│   └── index.ts
├── tray.ts                        # Tray icon
├── updater.ts                     # Auto-update
└── index.ts                       # Main process
    # registerGlobalShortcuts()
    # setupPowerMonitor()
    # handleDeepLink()
    # Single instance lock
```

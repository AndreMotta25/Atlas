---
name: electron-ipc-typescript
description: >
  Use esta skill sempre que precisar implementar comunicação entre processos (IPC) em aplicações
  Electron com TypeScript. Cobre o padrão type-safe completo (tipos centralizados → handlers com Zod
  → preload → custom hook no renderer), segurança obrigatória (contextIsolation, validação Zod,
  CSP), broadcasting de eventos (Main → Renderer), otimização de performance IPC e organização de
  handlers por domínio. Acione quando o usuário mencionar ipcMain, ipcRenderer, contextBridge,
  preload, IPC channel, ou ao criar qualquer handler que se comunique entre main e renderer.
compatibility: "Electron + TypeScript + React (Webpack Renderer)"
license: Proprietary
---

# Electron IPC Type-Safe

## Visão Geral do Padrão

A comunicação IPC segura segue 5 passos obrigatórios:

```
src/types/index.ts  →  src/ipc/*_handlers.ts  →  src/preload.ts  →  src/hooks/use_electron_api.ts  →  Componente
     (tipos)               (main process)           (bridge)              (abstração React)
```

---

## Passo 1 — Tipos Centralizados (`src/types/index.ts`)

```typescript
export interface FileOpenRequest {
  title?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  defaultPath?: string;
}

export interface FileOpenResponse {
  filePath: string | null;
  canceled: boolean;
  error?: string;
}

export interface FileSaveRequest {
  filePath: string;
  content: string;
  encoding?: BufferEncoding;
}

export interface FileSaveResponse {
  success: boolean;
  error?: string;
}

// Padrão de resposta genérico
export interface IPCResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
}
```

---

## Passo 2 — Handlers com Validação Zod (`src/ipc/file_handlers.ts`)

```typescript
import { ipcMain, dialog } from "electron";
import { promises as fs } from "fs";
import { z } from "zod";
import type { FileOpenRequest, FileSaveRequest } from "../types";

const fileOpenSchema = z.object({
  title: z.string().optional(),
  filters: z
    .array(
      z.object({
        name: z.string(),
        extensions: z.array(z.string()),
      }),
    )
    .optional(),
  defaultPath: z.string().optional(),
});

const fileSaveSchema = z.object({
  filePath: z.string().min(1, "File path is required"),
  content: z.string(),
  encoding: z
    .enum(["utf8", "utf-8", "ascii", "base64"])
    .optional()
    .default("utf8"),
});

export function registerFileHandlers() {
  ipcMain.handle(
    "file:open-dialog",
    async (_event, request: FileOpenRequest) => {
      try {
        const validated = fileOpenSchema.parse(request); // SEMPRE validar

        const result = await dialog.showOpenDialog({
          title: validated.title,
          filters: validated.filters,
          defaultPath: validated.defaultPath,
          properties: ["openFile"],
        });

        return {
          filePath: result.filePaths[0] || null,
          canceled: result.canceled,
        };
      } catch (error) {
        return {
          filePath: null,
          canceled: true,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  ipcMain.handle("file:save", async (_event, request: FileSaveRequest) => {
    try {
      const validated = fileSaveSchema.parse(request);
      await fs.writeFile(
        validated.filePath,
        validated.content,
        validated.encoding,
      );
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

## Passo 3 — Preload Type-Safe (`src/preload.ts`)

```typescript
import { contextBridge, ipcRenderer } from "electron";
import type {
  FileOpenRequest,
  FileOpenResponse,
  FileSaveRequest,
  FileSaveResponse,
} from "./types";

const electronAPI = {
  openFile: (request: FileOpenRequest): Promise<FileOpenResponse> =>
    ipcRenderer.invoke("file:open-dialog", request),

  saveFile: (request: FileSaveRequest): Promise<FileSaveResponse> =>
    ipcRenderer.invoke("file:save", request),

  // Event listener com cleanup obrigatório
  onFileChanged: (callback: (filePath: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, filePath: string) =>
      callback(filePath);
    ipcRenderer.on("file:changed", handler);
    return () => ipcRenderer.removeListener("file:changed", handler); // retornar unsubscribe
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
export type ElectronAPI = typeof electronAPI;
```

**Estender `Window` em `src/types/index.ts`:**

```typescript
import type { ElectronAPI } from "../preload";

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

---

## Passo 4 — Custom Hook no Renderer (`src/hooks/use_electron_api.ts`)

```typescript
export const useElectronAPI = () => window.electronAPI;

// Uso em componente
import { useElectronAPI } from '../hooks/use_electron_api';

export const FileManager: React.FC = () => {
  const electronAPI = useElectronAPI();

  const handleOpenFile = async () => {
    const result = await electronAPI.openFile({
      title: 'Selecione um arquivo',
      filters: [{ name: 'Texto', extensions: ['txt', 'md'] }],
    });

    if (!result.canceled && result.filePath) {
      console.log('Arquivo:', result.filePath);
    }
  };

  return <button onClick={handleOpenFile}>Abrir Arquivo</button>;
};
```

---

## Passo 5 — Registro de Handlers (`src/ipc/index.ts`)

```typescript
import { registerFileHandlers } from "./file_handlers";
import { registerWindowHandlers } from "./window_handlers";
import { registerAppHandlers } from "./app_handlers";

export function registerAllIpcHandlers() {
  registerFileHandlers();
  registerWindowHandlers();
  registerAppHandlers();
}

// src/index.ts
app.whenReady().then(() => {
  registerAllIpcHandlers();
  createWindow();
});
```

**Estrutura de pastas recomendada:**

```
src/ipc/
├── index.ts              # Registra todos os handlers
├── file_handlers.ts
├── window_handlers.ts
└── app_handlers.ts
```

---

## Segurança — Regras Obrigatórias

### BrowserWindow — configuração mínima segura

```typescript
const mainWindow = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, "preload.js"),
    contextIsolation: true, // OBRIGATÓRIO
    nodeIntegration: false, // OBRIGATÓRIO
    sandbox: true, // RECOMENDADO
    webSecurity: true, // OBRIGATÓRIO
  },
});
```

### Nunca confiar em dados do renderer

```typescript
// ❌ INCORRETO — sem validação
ipcMain.handle("file:delete", async (_event, filePath: string) => {
  await fs.unlink(filePath); // PERIGOSO: path traversal possível
});

// ✅ CORRETO — com validação e restrição de diretório
const deleteSchema = z.object({
  filePath: z
    .string()
    .refine(
      (p) => p.startsWith("/safe/directory/"),
      "Caminho fora do diretório permitido",
    ),
});

ipcMain.handle("file:delete", async (_event, data) => {
  const { filePath } = deleteSchema.parse(data);
  await fs.unlink(filePath);
});
```

### Checklist de segurança IPC

- ✅ `contextIsolation: true`
- ✅ `nodeIntegration: false`
- ✅ `sandbox: true`
- ✅ Todos os inputs validados com Zod
- ✅ Tratamento estruturado de erros
- ✅ Canais namespaced (`namespace:action`)
- ✅ Cleanup de event listeners implementado

---

## Restrições do Renderer (CSP)

Com `contextIsolation: true` + `sandbox: true`, o renderer **não pode**:

- ❌ `fetch()` direto para APIs externas → viola CSP
- ❌ Acessar `fs`, `path` ou qualquer módulo Node
- ❌ Acessar recursos do sistema diretamente

**Toda chamada externa vai pelo main process via IPC:**

```typescript
// Handler no main process
ipcMain.handle("api:call", async (_event, request) => {
  const validated = apiCallSchema.parse(request);
  const response = await fetch(validated.endpoint, {
    method: validated.method,
    headers: { "Content-Type": "application/json" },
    body: validated.body ? JSON.stringify(validated.body) : undefined,
  });
  return { success: true, data: await response.json() };
});

// Renderer chama via IPC — nunca fetch direto
const data = await window.electronAPI.apiCall({
  endpoint: "https://api.example.com/data",
});
```

---

## Broadcasting (Main → Renderer)

```typescript
// Main process
import { BrowserWindow } from 'electron';

export function notifyFileChanged(window: BrowserWindow, filePath: string) {
  window.webContents.send('file:changed', { filePath, timestamp: Date.now() });
}

// Renderer com useEffect + cleanup
export const FileMonitor: React.FC = () => {
  const electronAPI = useElectronAPI();

  useEffect(() => {
    const unsubscribe = electronAPI.onFileChanged((filePath) => {
      console.log('Arquivo alterado:', filePath);
    });
    return unsubscribe; // cleanup automático no unmount
  }, [electronAPI]);

  return <div>Monitorando alterações...</div>;
};
```

---

## Performance IPC

```typescript
// ❌ Enviar buffer grande
ipcMain.handle('image:process', async (_event, imageData: Buffer) => { ... });

// ✅ Enviar caminho de arquivo — processar no main
ipcMain.handle('image:process', async (_event, imagePath: string) => {
  const imageData = await fs.readFile(imagePath);
  // processar aqui
});

// ❌ Múltiplas chamadas em loop
for (const id of userIds) { await electronAPI.fetchUser(id); }

// ✅ Uma chamada agrupada
await electronAPI.fetchUsers(userIds);

// Debounce para atualizações frequentes
const saveSettings = useCallback(
  debounce(async (settings: Settings) => {
    await electronAPI.saveSettings(settings);
  }, 500),
  [],
);
```

---

## Convenção de Nomes de Canais

```typescript
// ✅ CORRETO — namespaced
"file:open-dialog";
"file:save";
"file:delete";
"window:minimize";
"window:maximize";
"app:get-version";
"app:quit";

// ❌ INCORRETO — sem namespace
"openFile";
"saveFile";
"getVersion";
```

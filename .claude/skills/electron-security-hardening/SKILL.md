---
name: electron-security-hardening
description: >
  Use esta skill sempre que precisar endurecer a segurança de um app Electron além da configuração
  básica do BrowserWindow. Cobre: CSP via meta tag no index.html (único método válido com file://),
  safeStorage para credenciais (substituto do keytar deprecado), validação obrigatória de
  shell.openExternal, permission request handler para bloquear permissões desnecessárias,
  navigation guard para impedir redirecionamentos maliciosos, window open handler, desabilitar
  DevTools em produção e auditoria com electronegativity. Acione quando o usuário mencionar
  credenciais, tokens, CSP, safeStorage, shell.openExternal, permissões do sistema, ou ao
  implementar qualquer funcionalidade que envolva conteúdo externo ou dados sensíveis.
compatibility: "Electron 20+"
license: Proprietary
---

# Electron Security Hardening

> Segurança em camadas: cada item abaixo é uma barreira independente. Implemente todos.

---

## 1. Content Security Policy (CSP)

Como o app carrega via `file://`, não é possível usar headers HTTP. O CSP vai como `<meta>` no `src/index.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <!-- CSP para app local com React/Tailwind -->
    <meta
      http-equiv="Content-Security-Policy"
      content="
        default-src 'self';
        script-src 'self';
        style-src 'self' 'unsafe-inline';
        img-src 'self' data: blob:;
        font-src 'self' data:;
        connect-src 'none';
        object-src 'none';
        base-uri 'none';
        form-action 'none';
      "
    />
    <title>My Electron App</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

> **`style-src 'unsafe-inline'`** é necessário para Tailwind/CSS-in-JS injetado pelo webpack.
> **`connect-src 'none'`** força que toda chamada de rede passe pelo Main via IPC — não pelo renderer.

**CSP para desenvolvimento** (hot-reload precisa de `unsafe-eval`):

```typescript
// src/index.ts — aplicar via session antes de carregar a janela
import { session } from 'electron';

const isDev = process.env.NODE_ENV === 'development';

app.whenReady().then(() => {
  if (isDev) {
    // Permitir eval do webpack HMR só em dev
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:*",
          ],
        },
      });
    });
  }
  createWindow();
});
```

---

## 2. `safeStorage` — Armazenamento Seguro de Credenciais

> **Nunca use `keytar`** — não é mantido desde Dez/2022. Use `safeStorage` nativo do Electron.
> **Nunca armazene tokens/senhas em `localStorage`, arquivos `.env` ou `electron-store` sem criptografia.**

`safeStorage` usa Keychain (macOS), DPAPI (Windows) e `libsecret`/kwallet (Linux).

```typescript
// src/ipc/credentials_handlers.ts
import { ipcMain, safeStorage, app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';

// Arquivo de credenciais criptografadas no userData
const CREDENTIALS_FILE = path.join(app.getPath('userData'), 'credentials.enc');

// Estrutura interna (nunca exposta ao renderer diretamente)
interface StoredCredentials {
  [key: string]: string; // key → valor criptografado em base64
}

async function readCredentials(): Promise<StoredCredentials> {
  try {
    const raw = await fs.readFile(CREDENTIALS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeCredentials(data: StoredCredentials): Promise<void> {
  await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(data), 'utf8');
}

const credentialSchema = z.object({
  key: z.string().min(1).max(128),
  value: z.string().min(1),
});

export function registerCredentialHandlers() {
  // Salvar credencial
  ipcMain.handle('credentials:set', async (_event, request) => {
    if (!safeStorage.isEncryptionAvailable()) {
      return { success: false, error: 'Encryption not available on this system' };
    }

    try {
      const { key, value } = credentialSchema.parse(request);
      const encrypted = safeStorage.encryptString(value);
      const store = await readCredentials();
      store[key] = encrypted.toString('base64');
      await writeCredentials(store);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Ler credencial
  ipcMain.handle('credentials:get', async (_event, request) => {
    if (!safeStorage.isEncryptionAvailable()) {
      return { success: false, error: 'Encryption not available' };
    }

    try {
      const { key } = z.object({ key: z.string().min(1) }).parse(request);
      const store = await readCredentials();

      if (!store[key]) return { success: true, value: null };

      const decrypted = safeStorage.decryptString(Buffer.from(store[key], 'base64'));
      return { success: true, value: decrypted };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Deletar credencial
  ipcMain.handle('credentials:delete', async (_event, request) => {
    try {
      const { key } = z.object({ key: z.string().min(1) }).parse(request);
      const store = await readCredentials();
      delete store[key];
      await writeCredentials(store);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
}
```

**Expor no preload:**

```typescript
// src/preload.ts
const electronAPI = {
  // ... outros handlers
  credentials: {
    set: (key: string, value: string) => ipcRenderer.invoke('credentials:set', { key, value }),
    get: (key: string) => ipcRenderer.invoke('credentials:get', { key }),
    delete: (key: string) => ipcRenderer.invoke('credentials:delete', { key }),
  },
};
```

---

## 3. `shell.openExternal` — Validação Obrigatória

`shell.openExternal` pode abrir programas arbitrários. **Nunca chame com URL não validada.**

```typescript
// src/ipc/shell_handlers.ts
import { ipcMain, shell } from 'electron';
import { z } from 'zod';

// Lista de protocolos permitidos
const ALLOWED_PROTOCOLS = ['https:', 'mailto:', 'tel:'];

// Lista de domínios confiáveis (ajuste para seu caso)
const ALLOWED_DOMAINS = [
  'github.com',
  'docs.example.com',
];

function isSafeUrl(urlString: string): { safe: boolean; reason?: string } {
  let url: URL;

  try {
    url = new URL(urlString);
  } catch {
    return { safe: false, reason: 'URL inválida' };
  }

  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    return { safe: false, reason: `Protocolo não permitido: ${url.protocol}` };
  }

  // Para https, verificar domínio
  if (url.protocol === 'https:') {
    const isAllowed = ALLOWED_DOMAINS.some(
      domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`)
    );
    if (!isAllowed) {
      return { safe: false, reason: `Domínio não permitido: ${url.hostname}` };
    }
  }

  return { safe: true };
}

export function registerShellHandlers() {
  ipcMain.handle('shell:open-external', async (_event, request) => {
    try {
      const { url } = z.object({ url: z.string().url() }).parse(request);

      const check = isSafeUrl(url);
      if (!check.safe) {
        console.warn(`[shell:open-external] Bloqueado: ${check.reason} — URL: ${url}`);
        return { success: false, error: check.reason };
      }

      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
}
```

---

## 4. Permission Request Handler

Bloquear permissões do sistema que o app não usa (câmera, microfone, localização, notificações, etc.):

```typescript
// src/index.ts — configurar na criação da session
import { session } from 'electron';

const ALLOWED_PERMISSIONS = [
  'notifications', // remover se não usar Notification API
];

function setupPermissionHandler() {
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const origin = new URL(webContents.getURL()).origin;

      // Bloquear qualquer permissão de origem não-local
      if (!origin.startsWith('file://')) {
        console.warn(`[permissions] Bloqueado: ${permission} solicitado por ${origin}`);
        return callback(false);
      }

      if (ALLOWED_PERMISSIONS.includes(permission)) {
        return callback(true);
      }

      console.warn(`[permissions] Permissão não permitida: ${permission}`);
      callback(false);
    }
  );

  // Bloquear também verificações de permissão
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission) => {
      return ALLOWED_PERMISSIONS.includes(permission);
    }
  );
}
```

---

## 5. Navigation Guard

Impedir que o renderer navegue para URLs externas (vetor de ataque comum via links maliciosos):

```typescript
// src/index.ts — adicionar após createWindow()
function setupNavigationGuard(win: BrowserWindow) {
  // Bloquear navegação para qualquer URL que não seja local
  win.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== 'file:') {
      console.warn(`[navigation] Bloqueado: ${url}`);
      event.preventDefault();
    }
  });

  // Bloquear abertura de novas janelas
  win.webContents.setWindowOpenHandler(({ url }) => {
    console.warn(`[window-open] Bloqueado: ${url}`);
    // Se quiser abrir no navegador do sistema em vez de bloquear:
    // shell.openExternal(url) — mas validar com isSafeUrl() antes
    return { action: 'deny' };
  });
}
```

---

## 6. DevTools em Produção

```typescript
// src/index.ts
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const win = new BrowserWindow({ /* ... */ });

  if (isDev) {
    win.webContents.openDevTools();
  } else {
    // Bloquear F12 e atalhos de DevTools em produção
    win.webContents.on('before-input-event', (event, input) => {
      if (
        input.key === 'F12' ||
        (input.control && input.shift && input.key === 'I') ||
        (input.control && input.shift && input.key === 'J')
      ) {
        event.preventDefault();
      }
    });
  }
}
```

---

## 7. `BrowserWindow` — Configuração Completa de Segurança

```typescript
const win = new BrowserWindow({
  width: 1200,
  height: 800,
  show: false, // mostrar só após ready-to-show (evita flash branco)
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,        // OBRIGATÓRIO
    nodeIntegration: false,        // OBRIGATÓRIO
    sandbox: true,                 // RECOMENDADO — isola renderer do Node
    webSecurity: true,             // OBRIGATÓRIO — não desabilitar
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    // Desabilitar middle-click (abre links em nova janela — vetor de XSS)
    disableBlinkFeatures: 'Auxclick',
  },
});

// Mostrar janela só quando conteúdo estiver pronto (sem flash)
win.once('ready-to-show', () => win.show());
```

---

## 8. Auditoria com `electronegativity`

Ferramenta de análise estática que detecta configurações inseguras automaticamente:

```bash
npx @doyensec/electronegativity -i ./src -t JSTS
```

Erros comuns que ele detecta:
- `nodeIntegration: true` em qualquer BrowserWindow
- `contextIsolation: false`
- `webSecurity: false`
- CSP ausente ou muito permissiva
- `shell.openExternal` sem validação
- Uso do módulo `remote` (deprecado)

---

## Checklist de Segurança Completo

```
BrowserWindow
  ✅ contextIsolation: true
  ✅ nodeIntegration: false
  ✅ sandbox: true
  ✅ webSecurity: true
  ✅ allowRunningInsecureContent: false
  ✅ disableBlinkFeatures: 'Auxclick'
  ✅ show: false + ready-to-show

CSP
  ✅ <meta> tag no index.html
  ✅ connect-src 'none' (chamadas de rede apenas via IPC)
  ✅ object-src 'none'
  ✅ base-uri 'none'

IPC
  ✅ Todos os inputs validados com Zod
  ✅ Canais namespaced (namespace:action)
  ✅ contextBridge expõe funções específicas — nunca ipcRenderer diretamente

Credenciais
  ✅ safeStorage para tokens e senhas
  ✅ Nada sensível em localStorage, arquivos texto ou electron-store sem criptografia

shell.openExternal
  ✅ Validar protocolo (somente https:, mailto:, tel:)
  ✅ Validar domínio contra allowlist
  ✅ Chamado sempre via IPC, nunca direto no renderer

Navegação
  ✅ will-navigate interceptado
  ✅ setWindowOpenHandler bloqueando novas janelas

Permissões
  ✅ setPermissionRequestHandler configurado
  ✅ Somente permissões usadas na allowlist

DevTools
  ✅ Desabilitado em produção
  ✅ Atalhos de teclado bloqueados

Auditoria
  ✅ electronegativity rodando no CI
```

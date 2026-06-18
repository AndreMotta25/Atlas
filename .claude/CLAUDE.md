# My Electron App

## Visão Geral

Aplicação desktop construída com Electron, usando Webpack como bundler e TypeScript para type-safety. Segue o template oficial `webpack-typescript` do Electron Forge.

## Stack

| Tecnologia         | Papel                             |
| ------------------ | --------------------------------- |
| **Electron**       | Framework desktop multiplataforma |
| **TypeScript**     | Tipagem estática                  |
| **Webpack**        | Module bundler                    |
| **Electron Forge** | Build, package e distribuição     |
| **React**          | Interfaces de usuário             |
| **TailwindCSS**    | Estilização utilitária            |

---

## Estrutura do Projeto

```
my-app/
├── .claude/
│   ├── rules/                          # Diretrizes detalhadas (ver seção Rules)
│   └── skills/                         # Skills de referência para o Claude
│       ├── electron-ipc-typescript.md
│       ├── electron-react-tailwind-setup.md
│       ├── electron-security-hardening.md
│       ├── electron-native-apis.md
│       └── react-solid-typescript.md
├── .webpack/                           # Gerado pelo Webpack (gitignored)
├── src/
│   ├── components/                     # Componentes React (renderer)
│   ├── hooks/                          # Custom hooks
│   ├── ipc/                            # Handlers IPC por domínio
│   │   ├── index.ts
│   │   ├── file_handlers.ts
│   │   ├── credentials_handlers.ts     # safeStorage
│   │   ├── notification_handlers.ts    # Notification API
│   │   ├── shell_handlers.ts           # shell.openExternal (validado)
│   │   ├── theme_handlers.ts           # nativeTheme
│   │   ├── window_handlers.ts
│   │   └── app_handlers.ts
│   ├── types/
│   │   └── index.ts                    # TODOS os tipos TypeScript centralizados aqui
│   ├── assets/                         # Ícones, imagens (tray icon, etc.)
│   ├── index.css                       # Estilos globais (inclui diretivas Tailwind)
│   ├── index.html                      # Inclui <meta> CSP obrigatório
│   ├── index.ts                        # Entry point — Main Process
│   ├── preload.ts                      # Bridge IPC (contextBridge)
│   ├── tray.ts                         # Tray icon do sistema
│   └── updater.ts                      # Auto-update (electron-updater)
│   └── renderer.tsx                    # Entry point — Renderer Process
├── forge.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── webpack.main.config.ts
├── webpack.renderer.config.ts
├── webpack.plugins.ts
└── webpack.rules.ts
```

---

## Scripts

```bash
npm start           # Desenvolvimento
npm run package     # Gera executável para a plataforma atual
npm run make        # Cria instaladores/distributables
npm run publish     # Publica a aplicação
npm run lint        # ESLint
```

---

## Arquitetura Electron

### Os três processos

| Processo     | Arquivo            | Papel                                                  |
| ------------ | ------------------ | ------------------------------------------------------ |
| **Main**     | `src/index.ts`     | Node.js — ciclo de vida, janelas, IPC handlers         |
| **Renderer** | `src/renderer.tsx` | DOM/React — interface do usuário                       |
| **Preload**  | `src/preload.ts`   | Ponte segura entre Main e Renderer via `contextBridge` |

### Comunicação IPC

Toda comunicação entre Main e Renderer usa IPC type-safe com Zod para validação.

> 📖 **Ver skill:** `.claude/skills/electron-ipc-typescript.md`

**Resumo do padrão:**

1. Tipos centralizados em `src/types/index.ts`
2. Handlers no Main com validação Zod (`src/ipc/*_handlers.ts`)
3. API exposta via `contextBridge` no preload
4. Acesso no renderer via `useElectronAPI()` hook

**Canais IPC usam formato namespaced:** `namespace:action`

```
file:open-dialog  |  file:save  |  window:minimize  |  app:get-version
```

### Restrição CSP importante

O Renderer **não pode** fazer `fetch()` direto para APIs externas. Toda chamada externa passa pelo Main Process via IPC. Ver skill de IPC para o padrão completo.

---

## Setup Inicial (React + Tailwind)

> 📖 **Ver skill:** `.claude/skills/electron-react-tailwind-setup.md`

Checklist de configuração em ordem obrigatória:

1. `npm install react react-dom && npm install -D @types/react @types/react-dom`
2. Adicionar `"jsx": "react-jsx"` ao `tsconfig.json`
3. Atualizar `forge.config.ts` — `js` do entryPoint aponta para `renderer.tsx`
4. `npm install -D tailwindcss@3 postcss autoprefixer && npx tailwindcss init`
5. Configurar `tailwind.config.js` e criar `postcss.config.js`
6. Adicionar diretivas `@tailwind` ao `index.css`
7. `npm install --save-dev postcss-loader`
8. Atualizar `webpack.renderer.config.ts` com `postcss-loader` (ordem: postcss → css → style)

---

## Padrões de Código

### TypeScript

**Tipos centralizados — sempre em `src/types/index.ts`:**

```typescript
import { User, AppConfig, IPCChannel } from "./types"; // importar de um único lugar
```

**Proibido usar aliases de import:**

```typescript
// ❌ EVITAR
import { X } from "@/components/Component";

// ✅ USAR caminhos relativos
import { X } from "../../components/Component";
```

**Evitar `any` — usar `unknown` quando necessário.**

### Componentes React

> 📖 **Ver skill:** `.claude/skills/react-solid-typescript.md`

**Regras de criação de componentes:**

| Regra                                 | Exemplo                   |
| ------------------------------------- | ------------------------- |
| Arquivo em `snake_case`               | `user_card.tsx`           |
| Componente em `PascalCase`            | `UserCard`                |
| Named export obrigatório              | `export const UserCard`   |
| Interface de props com sufixo `Props` | `UserCardProps`           |
| Tipar com `React.FC<Props>`           | `React.FC<UserCardProps>` |
| Importar tipos de `../types`          | centralizado              |
| Máximo 300 linhas por arquivo         | dividir se maior          |

**Exemplo de componente:**

```typescript
// src/components/user_card.tsx
import React from 'react';
import type { User } from '../types';

interface UserCardProps {
  user: User;
  onEdit?: (user: User) => void;
}

export const UserCard: React.FC<UserCardProps> = ({ user, onEdit }) => (
  <div className="user-card">
    <h3>{user.name}</h3>
    <p>{user.email}</p>
    {onEdit && <button onClick={() => onEdit(user)}>Editar</button>}
  </div>
);
```

**Componentes complexos com subcomponentes:**

```
src/components/
├── user_card/
│   ├── user_card.tsx        # componente principal
│   ├── user_avatar.tsx      # subcomponente
│   └── user_card.css        # estilos específicos (opcional)
└── sidebar_menu.tsx
```

### Nomenclatura Geral

```typescript
// Arquivos          → snake_case:       user_service.ts, main_window.tsx
// Classes           → PascalCase:       class WindowManager {}
// Interfaces        → PascalCase:       interface UserData {}
// Funções/métodos   → camelCase:        function createWindow() {}
// Constantes        → UPPER_SNAKE_CASE: const MAX_RETRY_ATTEMPTS = 3;
// Variáveis         → camelCase:        let userName = 'John';
```

### Organização de Arquivos TypeScript

```typescript
// 1. Imports externos
import { app, BrowserWindow } from "electron";

// 2. Imports internos
import type { User } from "./types";

// 3. Constantes
const WINDOW_WIDTH = 800;

// 4. Tipos/interfaces locais (não reutilizáveis)
type LocalState = {
  /* ... */
};

// 5. Funções auxiliares
function helperFn() {
  /* ... */
}

// 6. Classe/função principal
export class MainClass {
  /* ... */
}
```

---

---

## Segurança

> 📖 **Ver skill:** `.claude/skills/electron-security-hardening.md`

Segurança é implementada em camadas — **todas obrigatórias**:

### CSP no `index.html`

Como o app carrega via `file://`, o CSP vai como `<meta>` — nunca via header HTTP:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
           connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';"
/>
```

> `connect-src 'none'` garante que **toda** chamada de rede passe pelo Main via IPC.

### `BrowserWindow` — configuração mínima segura

```typescript
new BrowserWindow({
  show: false, // mostrar só após ready-to-show
  webPreferences: {
    preload: path.join(__dirname, "preload.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    disableBlinkFeatures: "Auxclick", // previne middle-click malicioso
  },
});
```

### Credenciais — `safeStorage` (não use `keytar`)

`keytar` está abandonado desde Dez/2022. Use `safeStorage` nativo:

```typescript
import { safeStorage } from "electron";

// Criptografar (usa Keychain/DPAPI/libsecret por plataforma)
const encrypted = safeStorage.encryptString(token);
// Salvar encrypted.toString('base64') em arquivo no userData

// Descriptografar
const token = safeStorage.decryptString(Buffer.from(stored, "base64"));
```

### `shell.openExternal` — validar sempre

```typescript
// ❌ PERIGOSO
await shell.openExternal(url);

// ✅ CORRETO — validar protocolo e domínio antes
const check = isSafeUrl(url); // ver skill de segurança
if (check.safe) await shell.openExternal(url);
```

### Navigation Guard — bloquear redirecionamentos

```typescript
win.webContents.on("will-navigate", (event, url) => {
  if (!url.startsWith("file://")) event.preventDefault();
});
win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
```

### Permission Handler

```typescript
session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
  cb(ALLOWED_PERMISSIONS.includes(permission));
});
```

### DevTools em produção

```typescript
if (process.env.NODE_ENV !== "development") {
  win.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F12") event.preventDefault();
  });
}
```

### Checklist rápida

```
✅ CSP via <meta> no index.html (connect-src 'none')
✅ contextIsolation, nodeIntegration: false, sandbox, webSecurity
✅ disableBlinkFeatures: 'Auxclick'
✅ safeStorage para credenciais (sem keytar)
✅ shell.openExternal com validação de protocolo e domínio
✅ will-navigate + setWindowOpenHandler
✅ setPermissionRequestHandler
✅ DevTools desabilitado em produção
✅ electronegativity no CI (npx @doyensec/electronegativity -i ./src -t JSTS)
```

---

## APIs Nativas Electron

> 📖 **Ver skill:** `.claude/skills/electron-native-apis.md`

| API                                | Caso de uso                         | Arquivo sugerido                   |
| ---------------------------------- | ----------------------------------- | ---------------------------------- |
| `requestSingleInstanceLock`        | Garantir apenas 1 instância rodando | `src/index.ts`                     |
| `autoUpdater` / `electron-updater` | Atualizações automáticas            | `src/updater.ts`                   |
| `app.setAsDefaultProtocolClient`   | Deep links (`myapp://`)             | `src/index.ts`                     |
| `nativeTheme`                      | Dark/Light mode sincronizado com OS | `src/ipc/theme_handlers.ts`        |
| `powerMonitor`                     | Reagir a suspend/resume/lock        | `src/index.ts`                     |
| `Tray`                             | Ícone na bandeja do sistema         | `src/tray.ts`                      |
| `globalShortcut`                   | Atalhos globais de teclado          | `src/index.ts`                     |
| `Notification`                     | Notificações nativas do OS          | `src/ipc/notification_handlers.ts` |
| `app.getPath()`                    | Caminhos corretos por plataforma    | onde necessário                    |

**Padrão `app.getPath()` — nunca use caminhos hardcoded:**

```typescript
// ✅ Correto — paths por plataforma
const DB_PATH = path.join(app.getPath("userData"), "database.db");
const LOG_PATH = path.join(app.getPath("logs"), "app.log");
const CONF_PATH = path.join(app.getPath("userData"), "config.json");

// ❌ Errado
const DB_PATH = "/Users/joao/Library/Application Support/MyApp/database.db";
```

**Single Instance Lock — padrão obrigatório:**

```typescript
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit(); // segunda instância: sair
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => createWindow());
}
```

---

## Webpack

| Arquivo                      | Responsabilidade                      |
| ---------------------------- | ------------------------------------- |
| `webpack.main.config.ts`     | Main process                          |
| `webpack.renderer.config.ts` | Renderer process (inclui CSS/PostCSS) |
| `webpack.rules.ts`           | Regras compartilhadas                 |
| `webpack.plugins.ts`         | Plugins compartilhados                |

---

## Debugging

### VS Code (`.vscode/launch.json`)

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Electron Main",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron-forge",
      "runtimeArgs": ["start"],
      "protocol": "inspector"
    }
  ]
}
```

### Chrome DevTools

Processo Renderer: `F12` na janela da aplicação.

---

## Boas Práticas

### Performance

- `ipcRenderer.invoke` / `ipcMain.handle` para operações assíncronas
- Nunca enviar buffers grandes via IPC — passar caminho de arquivo, processar no Main
- Evitar operações pesadas no Main Process — usar Worker Threads se necessário
- Debounce em atualizações frequentes de estado

### Manutenibilidade

- Arquivos com máximo de 300 linhas — dividir se maior
- Documentar funções complexas com JSDoc
- Escrever testes para lógica de negócio crítica
- Commits semânticos: `feat:`, `fix:`, `refactor:`, `chore:`

---

## Troubleshooting

**Tipos Electron não reconhecidos:**

```bash
npm install --save-dev @types/electron
```

**Erro ao fazer build:**

```bash
rm -rf .webpack && npm start
```

**IPC não funciona — verificar preload na criação da janela:**

```typescript
const win = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, "preload.js"),
    contextIsolation: true,
    nodeIntegration: false,
  },
});
```

**Tailwind não aplica estilos:**

1. `postcss.config.js` existe na raiz?
2. `tailwind.config.js` tem `content: ['./src/**/*.{js,ts,jsx,tsx}']`?
3. `index.css` importado no `renderer.tsx`?
4. `postcss-loader` instalado e na ordem correta no Webpack?

**`safeStorage.isEncryptionAvailable()` retorna `false` no Linux:**
Sistema sem `libsecret`, kwallet ou gnome-keyring instalado. Instalar `gnome-libsecret`:

```bash
sudo apt install gnome-libsecret  # Debian/Ubuntu
```

**Deep link não abre o app no macOS em desenvolvimento:**
Deep links só funcionam com o app **empacotado** no macOS/Linux. Em dev, simule passando a URL como argumento:

```bash
npm start -- myapp://action/payload
```

**Auto-update não funciona no primeiro run:**
Apps instalados com Squirrel.Windows recebem `--squirrel-firstrun` na primeira execução. Adicionar guard:

```typescript
if (!process.argv.includes("--squirrel-firstrun")) {
  autoUpdater.checkForUpdates();
}
```

---

## Rule Files

Diretrizes detalhadas em `.claude/rules/`:

- **ZOD_V4_MIGRATION.md** — Guia de migração para Zod v4
- **SQLite.md** — Guia de uso do SQLite com Electron

## Skills

Referências técnicas em `.claude/skills/`:

| Skill                                | Cobre                                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **electron-ipc-typescript.md**       | IPC type-safe (tipos, Zod, preload, hooks, CSP, broadcasting, performance)                                                   |
| **electron-react-tailwind-setup.md** | React + TailwindCSS v3 + PostCSS + Webpack passo a passo                                                                     |
| **electron-security-hardening.md**   | CSP, `safeStorage`, `shell.openExternal`, permissions, navigation guard, DevTools, electronegativity                         |
| **electron-native-apis.md**          | Single instance, auto-update, deep links, `nativeTheme`, `powerMonitor`, Tray, `globalShortcut`, Notification, `app.getPath` |
| **react-solid-typescript.md**        | Princípios SOLID aplicados a componentes React com TypeScript                                                                |

---

## Recursos

- [Documentação Electron](https://www.electronjs.org/docs/latest)
- [Electron Security Guide](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Forge](https://www.electronforge.io/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [IPC Tutorial](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [electronegativity](https://github.com/doyensec/electronegativity) — auditoria de segurança estática

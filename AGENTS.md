# My Electron App

## Visão Geral

Aplicação desktop construída com Electron, usando Webpack como bundler e TypeScript para type-safety. Segue o template oficial `webpack-typescript` do Electron Forge.

## Stack

| Tecnologia         | Papel                                      |
| ------------------ | ------------------------------------------ |
| **Electron**       | Framework desktop multiplataforma          |
| **TypeScript**     | Tipagem estática                           |
| **Webpack**        | Module bundler                             |
| **Electron Forge** | Build, package e distribuição              |
| **React**          | Interfaces de usuário                      |
| **TailwindCSS v4** | Estilização utilitária (tema via `@theme`) |

---

## Estrutura do Projeto

```
my-app/
├── .claude/
│   ├── rules/                          # Diretrizes detalhadas (ver seção Rules)
│   └── skills/                         # Skills de referência para o Claude
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
├── postcss.config.mjs               # Plugin @tailwindcss/postcss (v4 — sem tailwind.config.js)
├── webpack.main.config.ts
├── webpack.preload.config.ts        # Config isolada do preload
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

## Fluxo obrigatório — sem exceções

Antes de criar qualquer arquivo, escrever código ou executar comandos:

1. Execute $ Get-ChildItem -Path "C:\Users\labor\.config\opencode\skills" -Recurse -Filter "SKILL.md" | Select-Object -ExpandProperty FullName para listar as skills disponíveis
2. Leia o conteúdo de cada SKILL.md relevante com `cat`
3. Só então comece a produzir

Se não houver skills relevantes, prossiga normalmente.

**Nunca comece a produzir sem antes executar o passo 1.**
Não há exceções para essa regra, mesmo que você acredite conhecer a tarefa.

## Arquitetura Electron

### Os três processos

| Processo     | Arquivo            | Papel                                                  |
| ------------ | ------------------ | ------------------------------------------------------ |
| **Main**     | `src/index.ts`     | Node.js — ciclo de vida, janelas, IPC handlers         |
| **Renderer** | `src/renderer.tsx` | DOM/React — interface do usuário                       |
| **Preload**  | `src/preload.ts`   | Ponte segura entre Main e Renderer via `contextBridge` |

### Comunicação IPC

Toda comunicação entre Main e Renderer usa IPC type-safe com Zod para validação.

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

O Renderer **não pode** fazer `fetch()` direto para APIs externas. Toda chamada externa passa pelo Main Process via IPC.

---

## Setup Inicial (React + Tailwind v4)

Checklist de configuração em ordem obrigatória:

1. `npm install react react-dom && npm install -D @types/react @types/react-dom`
2. Adicionar `"jsx": "react-jsx"` ao `tsconfig.json`
3. Atualizar `forge.config.ts` — `js` do entryPoint aponta para `renderer.tsx`
4. `npm install -D tailwindcss@4 @tailwindcss/postcss postcss` (sem `tailwind.config.js`)
5. Configurar `postcss.config.mjs` com o plugin `@tailwindcss/postcss`
6. No `index.css`: `@import 'tailwindcss';` (não usar `@tailwind base/components/utilities`)
7. `npm install --save-dev postcss-loader`
8. Atualizar `webpack.renderer.config.ts` com `postcss-loader` (ordem: postcss → css → style)

### ⚠️ Tailwind v4 — contrato de tema (regra de ouro)

Em v4 o `tailwind.config.js` foi removido. **Toda cor/utility registrada para o Tailwind deve ser declarada dentro de `@theme`** no CSS. Variáveis soltas em `:root`/`.dark` **não** geram utilidades — só existem como CSS variables em runtime.

Para suportar dark mode com troca em runtime via classe `.dark` no `<html>`, usar `@theme inline` religando as variáveis-base:

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

/* Religa as variáveis-base ao Tailwind — gera utilidades e troca com .dark */
@theme inline {
  --color-background: var(--background);
  --color-border: var(--border);
  --color-foreground: var(--foreground);
  --color-muted-foreground: var(--muted-foreground);
  /* …demais tokens… */
}

/* Valores concretos por tema */
:root {
  --background: #ffffff;
  --border: #e2e8f0;
  --foreground: #0f172a;
  /* … */
}

.dark {
  --background: #1e1e1e;
  --border: #333333;
  --foreground: #dcddde;
  /* … */
}
```

Agora `bg-background`, `border-border`, `text-foreground` etc. são geradas e refletem `.dark` automaticamente.

**Sintomas de tema mal-configurado (tokens fora do `@theme`):**

- Utilidades como `border-border`/`bg-background` não aplicam cor
- Bordas aparecem em `currentColor` (quase branco em dark mode)
- Cores não trocam ao aplicar `.dark`

Se ver qualquer um desses, verificar se o bloco `@theme inline` existe e cobre o token.

### Integração com `nativeTheme` (Electron)

A classe `.dark` no `<html>` deve espelhar o `nativeTheme` do Main via IPC: handler `theme:*` → `useTheme()` hook → aplicação da classe no `document.documentElement`.

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

## Abstração de Bibliotecas de Terceiros

Componentes importantes que dependem de bibliotecas externas devem ser encapsulados atrás de uma interface própria. Isso desacopla o restante da aplicação da lib concreta e facilita a troca futura.

**Quando aplicar:** editores de texto, gráficos, date pickers, drag-and-drop, rich text, mapas — qualquer lib com API proprietária e não-trivial.

```typescript
// ✅ Defina uma interface que representa o contrato do componente
interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  readOnly?: boolean;
}

// Implementação concreta com CodeMirror — isolada aqui
const Editor: React.FC<EditorProps> = ({ value, onChange, language, readOnly }) => {
  // uso interno do CodeMirror
  return <CodeMirrorEditor ... />;
};

// O restante da aplicação depende só de EditorProps, nunca do CodeMirror diretamente
<Editor value={code} onChange={setCode} language="typescript" />
```

Se precisar trocar de lib, apenas a implementação interna do `Editor` muda — nenhum componente consumidor precisa ser alterado.

---

## Reuso de Componentes

Antes de criar qualquer componente novo:

1. Verifique se já existe algo equivalente em `src/components/`
2. Se existir, prefira estender via props ou composição (ver OCP na skill SOLID)
3. Só crie um componente novo se não houver nada reutilizável

---

## Escopo de Implementação

Antes de implementar qualquer feature em um componente existente:

1. **Mapear todos os usos** — buscar todos os arquivos que importam ou renderizam o componente:

```bash
   grep -r "NomeDoComponente" src/
```

2. **Implementar na fonte, não no consumidor** — a feature deve viver dentro do próprio componente, nunca em quem o usa. Assim, qualquer lugar que renderizar o componente já terá o comportamento automaticamente.
3. **Confirmar se a feature deve ser opt-in** — se a funcionalidade não faz sentido em todos os contextos, expô-la via prop booleana com padrão seguro:

```typescript
interface ChatProps {
  enableContextMenu?: boolean; // false por padrão se opt-in
}
```

4. **Listar os locais afetados na resposta** — ao concluir, informar explicitamente quais arquivos/rotas passarão a ter o comportamento, para que o usuário possa validar.

> **Regra geral:** se o componente é reutilizado em mais de um lugar, a implementação nunca pode ser feita em apenas uma instância. Qualquer alteração de comportamento deve partir do componente-raiz.

---

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
| `webpack.preload.config.ts`  | Preload script (bundle isolado)       |
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

## Raciocínio sobre Componentes — Ramificações e Cenários

Antes de implementar qualquer componente React, o sub-agent **`@component-analyst`** deve ser invocado.

Ele lê o contexto real do projeto (store, componentes existentes, onde o dado é criado/modificado/deletado) e produz um relatório mapeando todos os cenários em que o componente pode existir: dados alterados ou deletados enquanto ele está montado, ações concorrentes, props desatualizadas e riscos de cleanup. O código só começa depois que o relatório foi produzido.

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

**Tailwind não aplica estilos (v4):**

1. `postcss.config.mjs` existe na raiz e usa o plugin `@tailwindcss/postcss`?
2. `index.css` começa com `@import 'tailwindcss';` (não `@tailwind base…`)?
3. `index.css` importado no `renderer.tsx`?
4. `postcss-loader` instalado e na ordem correta no Webpack (postcss → css → style)?

**Bordas/cores aparecem erradas no dark mode (brancas ou sem troca):**

Os tokens estão fora do `@theme`. Verificar:

1. Existe bloco `@theme inline { --color-*: var(--*) }` no `index.css`?
2. Cada token usado em utilidades (`bg-background`, `border-border`, `text-foreground`…) está mapeado nesse bloco?
3. A classe `.dark` está aplicada ao `document.documentElement` (`<html class="dark">`)?
4. Os valores concretos estão em `:root`/`.dark`, não dentro do `@theme`?

Sem `@theme`, utilidades como `border-border` não são geradas → fallback para `currentColor` → bordas em cor de texto (quase branco em dark mode).

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

## Recursos

- [Documentação Electron](https://www.electronjs.org/docs/latest)
- [Electron Security Guide](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Forge](https://www.electronforge.io/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [IPC Tutorial](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [electronegativity](https://github.com/doyensec/electronegativity) — auditoria de segurança estática

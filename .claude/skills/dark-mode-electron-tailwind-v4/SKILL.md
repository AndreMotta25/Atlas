---
name: dark-mode-electron-tailwind-v4
description: >
  Use esta skill para implementar ou corrigir dark mode (claro/escuro/sistema) em apps Electron
  com React + TailwindCSS v4, integrando a classe `.dark` ao `nativeTheme` do Main Process.
  Cobre: design tokens semânticos no `@theme` com nomenclatura shadcn (`background`, `foreground`,
  `muted`, `card`, `border`, `primary`), os 3 modelos de dark mode (classe fixa / prefers-color-scheme /
  toggle dinâmico), eliminação de flash inicial via `theme-bootstrap.js`, bridge IPC type-safe com
  validação Zod (`theme:set-source`), hook `useTheme` sincronizado com `nativeTheme.shouldUseDarkColors`,
  substituição de `bg-white dark:bg-slate-950` por classes semânticas, e uso de `var(--color-*)` em
  CSS vanilla (CodeMirror, widgets) e animações Framer Motion. Acione quando o usuário mencionar
  dark mode quebrado, cores hardcoded (`#0f172a`, `bg-white`), flash inicial de tema, `nativeTheme`,
  `themeSource`, tokens semânticos shadcn, ou ao migrar CSS com hex espalhados para design tokens.
compatibility: "Electron + React + TailwindCSS v4 (com contextBridge e nativeTheme)"
license: Proprietary
---

# Dark Mode em Electron + React + TailwindCSS v4

> Skill de referência para implementar temas (claro/escuro/sistema) de forma **não-hardcode**,
> consistente com o Tailwind v4, alinhada à convenção shadcn e sincronizada com o SO via `nativeTheme`.

---

## Princípios fundamentais

1. **Single source of truth**: o `nativeTheme` (Main Process) é a autoridade sobre qual tema está ativo.
2. **Sem hex espalhados**: cores vivem como **design tokens** no `@theme` — nunca literais em CSS ou JSX.
3. **Variante `dark` por classe**: o tema é aplicado adicionando `.dark` ao `<html>`, não por `prefers-color-scheme`.
4. **Flash-free**: a classe `.dark` deve ser aplicada **antes** do React montar.
5. **IPC type-safe**: o renderer nunca lê o SO diretamente — sempre via IPC.
6. **Nomenclatura semântica shadcn**: `background`, `foreground`, `muted`, `card`, `border`, `primary` — descrevem **papel**, não tom. Nunca `canvas`, `text`, `surface` ou outros nomes inventados.

---

## Os 3 modelos de dark mode no Tailwind v4

Antes de escrever qualquer código, **identifique qual modelo o projeto usa**. Não assuma.

### Modelo A — Classe `dark` fixa no HTML

Aplicação sempre escura (ex.: dashboard interno dark-only).

```css
@import "tailwindcss";

@theme {
  --color-background: #09090b;
  --color-foreground: #fafafa;
}
```

```html
<html lang="pt-BR" class="dark">
```

### Modelo B — `prefers-color-scheme` (segue o SO)

Sem toggle do usuário; apenas reage ao SO.

```css
@theme {
  --color-background: #ffffff;
  --color-foreground: #09090b;
}

@media (prefers-color-scheme: dark) {
  @theme {
    --color-background: #09090b;
    --color-foreground: #fafafa;
  }
}
```

### Modelo C — Toggle dinâmico pelo usuário ← **este projeto**

Usuário escolhe entre claro/escuro/sistema. Variáveis em `:root` + override em `.dark`.

```css
:root          { --color-background: #ffffff; }
.dark          { --color-background: #09090b; }
```

```html
<html class="dark">  <!-- adicionado via JS -->
```

> **Regra inegociável:** nunca misture `darkMode: "class"` com `prefers-color-scheme` no CSS.
> Escolha um modelo e mantenha consistente em todo o projeto.

---

## Camada 1 — Tokens no `@theme` (Tailwind v4, Modelo C)

Toda a paleta vive **uma única vez** em `src/index.css`, seguindo a nomenclatura canônica shadcn:

```css
@import 'tailwindcss';

/* Variante dark ativada por classe, não pelo SO */
@custom-variant dark (&:where(.dark, .dark *));

/* ─────────── Design Tokens — Modelo C ───────────
   Nomes SEMÂNTICOS descrevem PAPEL na UI, não tom.
   Os componentes referenciam estes nomes, nunca os hex.
   Convenção shadcn/ui — reconhecida por qualquer dev React.
*/
:root {
  /* Superfícies */
  --color-background:         #ffffff;  /* fundo da página */
  --color-card:               #ffffff;  /* cards, modais, popovers */
  --color-muted:              #f1f5f9;  /* fundo de código, painéis */

  /* Bordas */
  --color-border:             #e2e8f0;
  --color-input:              #cbd5e1;  /* borda de inputs focáveis */

  /* Texto */
  --color-foreground:         #0f172a;  /* texto principal */
  --color-muted-foreground:   #475569;  /* texto secundário */

  /* Acententos / ações */
  --color-primary:            #2563eb;
  --color-primary-foreground: #ffffff;
  --color-accent:             #f5f3ff;  /* hover de itens selecionados */
  --color-accent-foreground:  #7c3aed;

  /* Semânticas (não mudam entre temas — apenas o tom) */
  --color-destructive:        #dc2626;
  --color-success:            #16a34a;
  --color-warning:            #d97706;

  /* Markdown / Live Preview */
  --color-inline-code-bg:     #f1f5f9;
  --color-inline-code-fg:     #be185d;
  --color-wikilink-fg:        #7c3aed;
  --color-wikilink-bg:        #f5f3ff;
  --color-tag-fg:             #0891b2;
  --color-tag-bg:             #ecfeff;
  --color-quote-border:       #cbd5e1;
  --color-quote-fg:           #475569;

  /* Color-scheme nativo (scrollbars, inputs nativos) */
  color-scheme: light;
}

/* ─────────── Override dos tokens quando .dark está ativo ─────────── */
.dark {
  --color-background:         #0f172a;
  --color-card:               #1e293b;
  --color-muted:              #1e293b;

  --color-border:             #1e293b;
  --color-input:              #334155;

  --color-foreground:         #e2e8f0;
  --color-muted-foreground:   #94a3b8;

  --color-primary:            #60a5fa;
  --color-primary-foreground: #0f172a;
  --color-accent:             #1e1b4b;
  --color-accent-foreground:  #a78bfa;

  --color-destructive:        #f87171;
  --color-success:            #4ade80;
  --color-warning:            #fbbf24;

  --color-inline-code-bg:     #1e293b;
  --color-inline-code-fg:     #f472b6;
  --color-wikilink-fg:        #a78bfa;
  --color-wikilink-bg:        #1e1b4b;
  --color-tag-fg:             #22d3ee;
  --color-tag-bg:             #083344;
  --color-quote-border:       #475569;
  --color-quote-fg:           #94a3b8;

  color-scheme: dark;
}
```

### Por que isso resolve o hardcode

- As cores aparecem **uma única vez** no arquivo.
- Mudar de `slate-950` para `zinc-950` é editar **1 linha**, não 20.
- Os componentes não sabem quais hex existem — só consomem tokens.
- Os mesmos tokens servem para CSS vanilla (CodeMirror) **e** classes Tailwind.

> **Observação sobre Tailwind v4:** Ao contrário do v3, o `@theme` não precisa declarar
> `--color-*` dentro dele para gerar utilities — variáveis em `:root`/`.dark` já são
> reconhecidas como tokens Tailwind, desde que sigam o prefixo `--color-`.

---

## Camada 2 — Tabela de substituição canônica

Use **apenas** as classes da coluna do meio. As classes da direita estão proibidas.

| Situação                      | Classe correta              | Nunca use                                |
| ----------------------------- | --------------------------- | ---------------------------------------- |
| Fundo da página               | `bg-background`             | `bg-white`, `bg-slate-50`                |
| Fundo de card / modal         | `bg-card`                   | `bg-white`, `bg-slate-100`               |
| Fundo de painel / código      | `bg-muted`                  | `bg-slate-100`, `bg-gray-50`             |
| Texto principal               | `text-foreground`           | `text-black`, `text-slate-900`           |
| Texto secundário              | `text-muted-foreground`     | `text-slate-500`, `text-gray-600`        |
| Bordas em geral               | `border-border`             | `border-slate-200`, `border-gray-300`    |
| Bordas de input               | `border-input`              | `border-slate-300`, `border-gray-400`    |
| Botão primário (fundo)        | `bg-primary`                | `bg-blue-600`, `bg-black`                |
| Botão primário (texto)        | `text-primary-foreground`   | `text-white`                             |
| Item selecionado / hover      | `bg-accent text-accent-foreground` | `bg-slate-100`                    |
| Erro                          | `text-destructive`          | `text-red-600`                           |
| Sucesso                       | `text-success`              | `text-green-600`                         |

### Regras inegociáveis

1. **Nunca** use `text-black`, `text-white`, `bg-white`, `bg-black` hardcoded.
2. **Nunca** adicione `dark:text-*` em cima de uma classe fixa — remova a classe fixa e use semântica.
3. **Nunca** misture `darkMode: "class"` com `prefers-color-scheme` no CSS.
4. Toda cor no `@theme` deve ter um par semântico claro (`foreground`, `background`, `muted`...).
5. A classe `dark` no `<html>` é **obrigatória** — sem ela nenhum `dark:` funciona.

### Quando ainda usar `dark:` variant

Apenas quando a **estrutura** muda entre temas (não a cor):

```tsx
// ✅ Bom — estrutura diferente
<aside className="border-r dark:border-l border-border">

// ✅ Bom — sombra mais forte no dark
<div className="shadow-md dark:shadow-2xl">
```

Para cores, **nunca** duplique com `dark:` — confie no token.

---

## Camada 3 — CSS vanilla consumindo os tokens

CodeMirror, Live Preview e widgets não têm acesso ao Tailwind — usam `var(--token)`:

```css
/* ✅ Correto — referência ao token */
.dark .cm-editor {
  background: var(--color-background);
  color: var(--color-foreground);
}

.dark .cm-editor .cm-gutters {
  background: var(--color-background);
  border-color: var(--color-border);
  color: var(--color-muted-foreground);
}

.atlas-code {
  background: var(--color-inline-code-bg);
  color: var(--color-inline-code-fg);
}

.atlas-wikilink {
  color: var(--color-wikilink-fg);
  background: var(--color-wikilink-bg);
}

/* ❌ ERRADO — hex direto */
.dark .cm-editor {
  background: #0f172a;
}
```

---

## Camada 4 — Main Process (`nativeTheme`)

`src/index.ts`:

```typescript
import { app, BrowserWindow, nativeTheme } from 'electron';
import { ConfigStore } from './vault/config_store';
import { createChannel } from './types';

app.whenReady().then(() => {
  // 1. Restaurar tema persistido ANTES de criar a janela
  const saved = ConfigStore.load().themeMode ?? 'system';
  nativeTheme.themeSource = saved;

  // 2. Broadcast de mudanças do SO para todos os renderers
  nativeTheme.on('updated', () => {
    BrowserWindow.getAllWindows().forEach((w) => {
      w.webContents.send(
        createChannel('theme', 'changed'),
        nativeTheme.shouldUseDarkColors,
      );
    });
  });

  createWindow();
});
```

`src/ipc/theme_handlers.ts` — **com validação Zod** (exigido pelo CLAUDE.md):

```typescript
import { ipcMain, nativeTheme } from 'electron';
import { z } from 'zod';
import { createChannel } from '../types';

const ThemeSourceSchema = z.enum(['system', 'light', 'dark']);

export const registerThemeHandlers = (): void => {
  ipcMain.handle(createChannel('theme', 'get-source'), () =>
    nativeTheme.themeSource,
  );

  ipcMain.handle(createChannel('theme', 'set-source'), async (_e, raw: unknown) => {
    const parsed = ThemeSourceSchema.parse(raw); // ← valida entrada
    nativeTheme.themeSource = parsed;
    return { success: true, shouldUseDarkColors: nativeTheme.shouldUseDarkColors };
  });

  ipcMain.handle(createChannel('theme', 'should-use-dark-colors'), () =>
    nativeTheme.shouldUseDarkColors,
  );
};
```

---

## Camada 5 — Preload bridge

`src/preload.ts`:

```typescript
contextBridge.exposeInMainWorld('atlas', {
  // ... outras APIs

  getThemeSource: () => ipcRenderer.invoke(createChannel('theme', 'get-source')),
  setThemeSource: (source: 'system' | 'light' | 'dark') =>
    ipcRenderer.invoke(createChannel('theme', 'set-source'), source),
  shouldUseDarkColors: () =>
    ipcRenderer.invoke(createChannel('theme', 'should-use-dark-colors')),
  onThemeChanged: (listener: Listener<boolean>): Unsubscribe => {
    const channel = createChannel('theme', 'changed');
    const wrapped = (_e: unknown, payload: boolean) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
```

---

## Camada 6 — Hook `useTheme`

`src/hooks/use_theme.ts`:

```typescript
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSettingsStore } from '../stores/settings_store';
import type { ThemeMode } from '../types';

function applyDarkClass(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark);
}

export const useTheme = () => {
  const [isDark, setIsDark] = useState(false);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);

  useEffect(() => {
    void api.shouldUseDarkColors().then((dark) => {
      setIsDark(dark);
      applyDarkClass(dark);
    });

    const unsub = api.onThemeChanged((dark) => {
      setIsDark(dark);
      applyDarkClass(dark);
    });
    return unsub;
  }, []);

  const setTheme = async (mode: ThemeMode) => {
    // set-source já retorna o novo estado — evita segunda chamada IPC
    const result = await api.setThemeSource(mode);
    if (result?.shouldUseDarkColors !== undefined) {
      setIsDark(result.shouldUseDarkColors);
      applyDarkClass(result.shouldUseDarkColors);
    }
    await updateSettings({ themeMode: mode });
  };

  return { isDark, themeMode: settings.themeMode, setTheme };
};
```

---

## Camada 7 — Eliminar flash inicial (CRÍTICO)

Sem isso, mesmo em dark mode o usuário vê um flash claro por ~50-100ms antes do React montar.

### Solução: script inline no `index.html`

O CSP atual bloqueia scripts inline. **Não abra exceção** — em vez disso,
aplique o tema **antes** do bundle carregar via um script mínimo permitido.

#### Opção A — Arquivo `theme-bootstrap.js` (recomendado)

`index.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ..." />
    <!-- Theme bootstrap: roda antes do React, sem violar CSP -->
    <script src="theme-bootstrap.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

`src/theme-bootstrap.ts` (compilado para `theme-bootstrap.js`):

```typescript
// Lê a preferência do SO de forma SÍNCRONA via media query do browser.
// Como está em file://, o prefers-color-scheme reflete o nativeTheme.
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
if (prefersDark) document.documentElement.classList.add('dark');
```

> ⚠️ Limitação: `prefers-color-scheme` reflete o SO, não o `nativeTheme.themeSource`
> se o usuário escolheu "light" manualmente enquanto o SO está em dark.
> Para cobrir 100% dos casos, é preciso ler do ConfigStore no preload **síncrono** —
> mas isso quebra o modelo `contextBridge`. A media query cobre o caso mais comum (system mode).

#### Opção B — `color-scheme` no CSS (sempre incluir)

Já está no bloco `:root`/`.dark` acima. Faz scrollbars e inputs nativos reagirem:

```css
:root { color-scheme: light; }
.dark  { color-scheme: dark; }
```

---

## Camada 8 — Padrão de uso nos componentes React

```tsx
// ✅ BOM — só tokens semânticos, sem dark: para cores
export const ChatPanel: React.FC<ChatPanelProps> = () => (
  <div className="flex flex-col h-full bg-background">
    <header className="px-3 py-2 border-b border-border text-muted-foreground">
      Chat
    </header>
    <textarea className="
      flex-1 px-2 py-1
      bg-card
      text-foreground
      border border-input
      focus:border-primary
    " />
  </div>
);

// ❌ RUIM — duplicação, classes fixas
<div className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">

// ❌ PIOR — hex sabe-se lá de onde
<div className="bg-[#0f172a] text-[#e2e8f0]">
```

---

## Camada 9 — Framer Motion e animações

Animações que tocam cor devem referenciar **variáveis**, nunca hex.

```tsx
import { motion } from 'framer-motion';

// ❌ ERRADO — cor hardcoded no animate
<motion.div animate={{ color: '#000000' }} />

// ❌ ERRADO — cor hardcoded no initial
<motion.div initial={{ backgroundColor: '#ffffff' }} />

// ✅ CORRETO — variável CSS
<motion.div animate={{ color: 'var(--color-foreground)' }} />
<motion.div initial={{ backgroundColor: 'var(--color-background)' }} />
```

Garanta que as `var(--color-*)` usadas existam no `:root` e no `.dark`. Se uma animação
ficar invisível em algum tema, quase sempre é hex hardcoded no `animate`/`initial`.

---

## Checklist de migração

Use esta lista ao revisar qualquer arquivo:

- [ ] **`index.css`**: todos os hex estão dentro de `:root` ou `.dark` (nunca soltos)?
- [ ] **`index.css`**: `color-scheme: light/dark` declarado?
- [ ] **Componentes**: usam `bg-background`, `text-foreground`, `border-border` (sem `dark:`)?
- [ ] **Componentes**: nenhum `bg-white`, `text-black`, `bg-slate-*` hardcoded?
- [ ] **CSS vanilla** (CodeMirror, widgets): usa `var(--token)` em vez de hex?
- [ ] **Framer Motion**: animações usam `var(--color-*)`, nunca hex?
- [ ] **`useTheme`**: aplica classe antes do primeiro render visível (sem flash)?
- [ ] **`theme-bootstrap.js`**: incluído no `index.html` antes do bundle?
- [ ] **IPC `theme:set-source`**: tem validação Zod?
- [ ] **`setTheme`**: usa o retorno de `set-source` em vez de segunda chamada IPC?
- [ ] **Persistência**: `themeMode` é gravado no ConfigStore e restaurado no boot?

---

## Anti-padrões comuns

| Padrão                                  | Por que é ruim                                                |
| --------------------------------------- | ------------------------------------------------------------- |
| `bg-white dark:bg-slate-950` em tudo    | Duplica intenção; cor não é semântica                         |
| Hex direto em CSS (`#0f172a`)           | Não tem onde mudar centralmente; typo fácil                   |
| `prefers-color-scheme` no CSS           | Ignora `nativeTheme.themeSource`; usuário não consegue forçar |
| Tema aplicado só depois do `useEffect`  | Flash de tema errado no boot                                  |
| IPC sem Zod                             | Renderer malicioso pode setar valores inválidos               |
| Segunda chamada IPC após `set-source`   | Race condition; resposta pode vir antes do estado atualizar   |
| `animate={{ color: '#000' }}`           | Animação invisível no tema oposto                             |
| Nomes inventados (`canvas`, `surface`)  | Fogem da convenção shadcn; confunde outros devs               |
| `darkMode: "class"` + `prefers-color-scheme` | Modelos mistos no mesmo projeto geram conflitos          |

---

## Resumo em uma frase

> **As cores são tokens semânticos shadcn (`background`, `foreground`, `muted`, ...) no `:root`/`.dark`,
> o tema é uma classe no `<html>`, o `nativeTheme` é a autoridade, e o renderer nunca vê um hex.**

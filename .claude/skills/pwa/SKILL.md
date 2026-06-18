---
name: pwa
description: Cria, configura, implementa e faz debugging de Progressive Web Apps (PWA) com Next.js App Router usando serwist. Use este skill sempre que o usuário mencionar PWA, "app instalável", service worker, offline, precache, manifest.json, ícones PWA, serwist, workbox, @serwist/next, cache de assets, fallback offline, `sw.ts`, ou qualquer funcionalidade de app instalável no Next.js — mesmo que a palavra "skill" não seja usada. Também use se o usuário quiser criar um PWA do zero, estiver migrando de `@ducanh2912/next-pwa` para serwist, debugando erros de SW no DevTools, configurando estratégias de cache, ou perguntando por que a página offline não aparece.
---

# PWA com Serwist no Next.js App Router

## Stack

| Componente             | Biblioteca            |
| ---------------------- | --------------------- |
| Plugin Next.js         | `@serwist/next`       |
| Service Worker Runtime | `serwist`             |
| Expiration Plugin      | `@serwist/expiration` |

> **Por que serwist?** `@ducanh2912/next-pwa` falha silenciosamente no App Router 13+: não gera `fallback-*.js`, não injeta `handlerDidError` e o `~` nas rotas quebra o precache. Serwist resolve isso nativamente.

---

## Arquivos-chave

| Arquivo                    | Propósito                                                      |
| -------------------------- | -------------------------------------------------------------- |
| `next.config.ts`           | `withSerwistInit` — swSrc, swDest, additionalPrecacheEntries   |
| `src/sw.ts`                | Source do service worker (compilado via `InjectManifest`)      |
| `src/app/offline/page.tsx` | Página fallback exibida quando o usuário está offline          |
| `tsconfig.json`            | Config principal — **deve excluir** `src/sw.ts`                |
| `tsconfig.sw.json`         | Config separada com `lib: ["ESNext", "WebWorker"]` para o SW   |
| `public/sw.js`             | **Gerado automaticamente no build** — NUNCA editar manualmente |
| `public/manifest.json`     | Web App Manifest (ícones, nome, tema)                          |

---

## Criando um PWA do zero

Se o projeto ainda não é um PWA, siga esta ordem antes do setup do serwist:

**1. Gerar os ícones**

O manifest exige múltiplos tamanhos. Parta de uma imagem 512×512px e gere:

| Arquivo                             | Tamanho | Uso                             |
| ----------------------------------- | ------- | ------------------------------- |
| `public/icons/icon-192x192.png`     | 192×192 | Android homescreen              |
| `public/icons/icon-512x512.png`     | 512×512 | Android splash / install prompt |
| `public/icons/apple-touch-icon.png` | 180×180 | iOS homescreen                  |
| `public/favicon.ico`                | 32×32   | Browser tab                     |

Ferramenta recomendada: [https://realfavicongenerator.net](https://realfavicongenerator.net) — gera todos os tamanhos de uma vez.

**2. Criar o `public/manifest.json`**

```json
{
  "name": "Nome Completo do App",
  "short_name": "App",
  "description": "Descrição curta do que o app faz",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable any"
    }
  ]
}
```

**Campos importantes do manifest:**

| Campo              | Valores possíveis                                   | Efeito                                                 |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------ |
| `display`          | `standalone`, `fullscreen`, `minimal-ui`, `browser` | `standalone` remove a barra do browser                 |
| `orientation`      | `portrait-primary`, `landscape-primary`, `any`      | Trava ou libera rotação                                |
| `theme_color`      | qualquer hex                                        | Cor da barra de status no Android                      |
| `background_color` | qualquer hex                                        | Cor do splash screen durante carregamento              |
| `purpose` no ícone | `maskable any`                                      | `maskable` adapta ao formato do SO (círculo, squircle) |

**3. Referenciar o manifest — `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nome do App",
  },
  formatDetection: { telephone: false },
  themeColor: "#000000",
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
```

> O Next.js injeta automaticamente `<link rel="manifest">` e `<meta name="theme-color">` a partir do objeto `metadata`. Não precisa adicionar tags manualmente no `<head>`.

**4. Validar o manifest antes de prosseguir**

- DevTools → Application → Manifest → sem erros em vermelho
- DevTools → Application → Manifest → "Add to homescreen" disponível

Só então prossiga para o setup do serwist abaixo.

---

## Setup completo

### 1. Instalação

```bash
npm install @serwist/next serwist @serwist/expiration
# Se migrando de @ducanh2912/next-pwa:
npm remove @ducanh2912/next-pwa
```

### 2. `next.config.ts`

```ts
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  // ...sua config existente
};

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: [
    { url: "/offline", revision: Date.now().toString() },
  ],
})(nextConfig);

export default withSerwist;
```

### 3. `src/sw.ts`

```ts
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
  runtimeCaching: [...defaultCache],
});

serwist.addEventListeners();
```

### 4. `src/app/offline/page.tsx`

```tsx
"use client";

export default function OfflinePage() {
  return (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <h1>Você está offline</h1>
      <p>Verifique sua conexão com a internet.</p>
      <button onClick={() => window.location.reload()}>Tentar novamente</button>
    </div>
  );
}
```

**Regras obrigatórias para a página offline:**

- **NÃO** usar `export const dynamic = "force-dynamic"` — precisa ser estática para entrar no precache
- **NÃO** usar `~` no nome da pasta — App Router não reconhece como rota válida
- Evitar dependências de dados dinâmicos

### 5. `tsconfig.json` — excluir o SW

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"]
  },
  "exclude": ["node_modules", "src/sw.ts"]
}
```

### 6. `tsconfig.sw.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esmoduleInterop": true,
    "types": ["serwist"]
  },
  "include": ["src/sw.ts"]
}
```

---

## Build

```bash
# Serwist usa plugin webpack — forçar em Next.js 16+ (Turbopack é padrão)
next build --webpack
```

Para Vercel, definir o build command como `next build --webpack`.

---

## Runtime Caching — referência rápida

Para detalhes completos sobre estratégias e exemplos, leia [`references/runtime-caching.md`](references/runtime-caching.md).

| Estratégia             | Quando usar                                    |
| ---------------------- | ---------------------------------------------- |
| `CacheFirst`           | Assets imutáveis (fontes, thumbnails externos) |
| `NetworkFirst`         | APIs, dados que precisam estar atualizados     |
| `StaleWhileRevalidate` | Assets que podem ser levemente desatualizados  |
| `NetworkOnly`          | Endpoints que nunca devem ser cacheados        |

---

## Debugging

Para guia completo de debugging, leia [`references/debugging.md`](references/debugging.md).

**Checklist rápido:**

1. DevTools → Application → Service Workers → SW está `activated and running`?
2. DevTools → Application → Cache Storage → `/offline` está no cache `serwist-precache-*`?
3. DevTools → Network → Throttling → Offline → Página `/offline` aparece?

---

## Problemas mais comuns

| Erro                                       | Causa                                             | Solução                                            |
| ------------------------------------------ | ------------------------------------------------- | -------------------------------------------------- |
| Página offline não aparece                 | `/offline` não está no precache                   | Verificar `additionalPrecacheEntries` + rebuild    |
| `Cannot find name 'localStorage'` no build | `src/sw.ts` incluído no `tsconfig.json` principal | Adicionar `"src/sw.ts"` ao `exclude`               |
| Build falha com erro Turbopack/webpack     | Next.js 16 usa Turbopack por padrão               | Usar `next build --webpack`                        |
| `Can't find self.__SW_MANIFEST`            | String literal ausente no `swSrc`                 | Garantir `self.__SW_MANIFEST` em `precacheEntries` |
| SW retorna 401 no Vercel                   | Vercel Deployment Protection habilitada           | Desabilitar em Settings → Protection               |
| SW antigo continua ativo                   | Navegador mantém SW anterior                      | DevTools → Unregister SW + fechar todas as tabs    |

Para lista completa de problemas e soluções, leia [`references/debugging.md`](references/debugging.md).

---

## Checklist de configuração

**Manifest e ícones (PWA do zero)**

- [ ] Ícones gerados: 192×192, 512×512, 180×180 (apple), favicon.ico
- [ ] `public/manifest.json` criado com `name`, `icons`, `display`, `start_url`
- [ ] `metadata.manifest` definido no `layout.tsx`
- [ ] DevTools → Application → Manifest → sem erros

**Serwist**

- [ ] `@serwist/next`, `serwist`, `@serwist/expiration` instalados
- [ ] `next.config.ts` usa `withSerwistInit` com `swSrc` e `swDest`
- [ ] `src/sw.ts` criado com triple-slash references e `Serwist` config
- [ ] `src/app/offline/page.tsx` criada (sem `~`, sem `force-dynamic`)
- [ ] `additionalPrecacheEntries` inclui `/offline` com `revision`
- [ ] `tsconfig.json` exclui `src/sw.ts`
- [ ] `tsconfig.sw.json` criado com `WebWorker` lib

**Validação final**

- [ ] `next build --webpack` completa sem erros
- [ ] SW está `activated and running` no DevTools
- [ ] Modo Offline exibe a página `/offline`
- [ ] "Add to homescreen" / install prompt aparece no browser

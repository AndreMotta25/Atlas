---
name: pwa-share-target
description: >
  Implement the Web Share Target API so a PWA appears in the native iOS/Android Share Sheet,
  allowing users to share links, text, and titles from any app directly into the PWA.
  Use this skill whenever the user asks how to make their PWA appear in the Share Sheet,
  receive shared content from other apps, integrate with native sharing on mobile, or
  mentions share_target, Share Sheet, or sharing to a PWA. Trigger even if the user just
  asks "how do I receive shared links in my PWA?" or "can my PWA show up when I share something?".
---

# Web Share Target API — PWA no Share Sheet nativo

Permite que a PWA apareça no Share Sheet do iOS e Android, assim como apps nativos.

> **Requisito:** O usuário precisa ter a PWA **instalada** (adicionada à tela inicial).
> No iOS, funciona a partir do **iOS 16.4+** via Safari.

---

## Passo 1 — Configurar o `manifest.json`

Adicionar a seção `share_target`:

```json
{
  "name": "Nome do App",
  "short_name": "App",
  "start_url": "/",
  "display": "standalone",
  "share_target": {
    "action": "/receber",
    "method": "GET",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
}
```

| Campo    | Descrição                                                             |
| -------- | --------------------------------------------------------------------- |
| `action` | Rota da PWA que vai receber o conteúdo compartilhado                  |
| `method` | `GET` envia os dados como query params na URL                         |
| `params` | Mapeia os campos padrão (`title`, `text`, `url`) para os query params |

---

## Passo 2 — Capturar os dados na rota `/receber`

Quando o usuário compartilhar algo para a PWA, ela abre e redireciona para:

```
https://seuapp.com/receber?title=Título&url=https://exemplo.com
```

Captura genérica (Vanilla JS):

```js
const params = new URLSearchParams(window.location.search);
const title = params.get("title");
const text = params.get("text");
const url = params.get("url");
```

---

## Exemplos por framework

### Next.js (App Router)

```tsx
// app/receber/page.tsx
"use client";
import { useSearchParams } from "next/navigation";

export default function ReceberPage() {
  const params = useSearchParams();
  const title = params.get("title");
  const url = params.get("url");
  const text = params.get("text");

  // Faça o que quiser com os dados: salvar, redirecionar, etc.
  return (
    <div>
      {title} — {url}
    </div>
  );
}
```

### React (React Router)

```tsx
import { useSearchParams } from "react-router-dom";

export default function ReceberPage() {
  const [params] = useSearchParams();
  const title = params.get("title");
  const url = params.get("url");

  return (
    <div>
      {title} — {url}
    </div>
  );
}
```

### Vue 3 (Vue Router)

```vue
<script setup>
import { useRoute } from "vue-router";
const route = useRoute();
const { title, url, text } = route.query;
</script>
```

---

## Receber arquivos (avançado)

Para aceitar arquivos (imagens, PDFs), usar `method: POST`:

```json
"share_target": {
  "action": "/receber-arquivo",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": {
    "title": "title",
    "files": [
      {
        "name": "arquivo",
        "accept": ["image/*", "application/pdf"]
      }
    ]
  }
}
```

No servidor ou service worker, capturar via `FormData`.

---

## Suporte por plataforma

| Plataforma       | Suporte            |
| ---------------- | ------------------ |
| Android (Chrome) | ✅ Sim             |
| iOS (Safari)     | ✅ Sim (iOS 16.4+) |
| Desktop (Chrome) | ✅ Sim             |
| Firefox          | ❌ Não suportado   |
| Samsung Internet | ✅ Sim             |

---

## Dicas importantes

- Sempre validar os dados recebidos — qualquer app pode compartilhar qualquer coisa para sua rota.
- No iOS, o app **precisa ser instalado via Safari** para aparecer no Share Sheet.
- Se o usuário usa Next.js com PWA via `serwist`, verificar a skill `pwa-serwist` para configuração do service worker.

---

## Referências

- [Web Share Target API — W3C](https://w3c.github.io/web-share-target/)
- [Web Share Target — web.dev](https://web.dev/web-share-target/)

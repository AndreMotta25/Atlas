---
name: dark-mode-tailwind-v4
description: "Use esta skill para qualquer tarefa envolvendo dark mode, temas visuais ou variáveis de cor com Tailwind v4 — incluindo diagnóstico de cores quebradas no dark mode, configuração de CSS variables, substituição de classes fixas por semânticas, integração com Framer Motion e Next.js. Ative sempre que o usuário relatar texto invisível, cores erradas no dark mode, conflitos de tema ou pedir para implementar/corrigir dark mode em projetos Next.js + Tailwind v4. Também ative quando o usuário mencionar frases como 'consertar o dark mode', 'o dark mode não está funcionando', 'não está em dark mode', 'dark mode quebrado' ou qualquer variação indicando que o tema escuro não está sendo aplicado corretamente."
---

# Dark Mode — Tailwind v4 + Next.js

## Passo 1 — Leia o projeto antes de qualquer coisa

Antes de propor qualquer mudança, leia estes arquivos:

- `globals.css` — variáveis CSS, `@theme`, configuração de cores
- `tailwind.config.ts` — `darkMode`, tokens customizados
- `src/app/layout.tsx` — presença ou ausência da classe `dark` no `<html>`
- Componente com problema — para identificar classes fixas vs semânticas

Nunca assuma como o tema está configurado. Leia primeiro.

---

## Passo 2 — Identifique o modelo de dark mode em uso

O Tailwind v4 usa `@theme` diretamente no CSS, abandonando o `tailwind.config.js` para tokens de cor. Há três modelos possíveis:

### Modelo A: classe `dark` fixa no HTML

```css
/* globals.css */
@import "tailwindcss";

@theme {
  --color-background: #09090b;
  --color-foreground: #fafafa;
  --color-muted: #27272a;
  --color-muted-foreground: #a1a1aa;
  --color-primary: #ffffff;
  --color-primary-foreground: #09090b;
  --color-border: #27272a;
  --color-card: #18181b;
  --color-card-foreground: #fafafa;
}
```

```tsx
// layout.tsx
<html lang="pt-BR" className="dark">
```

### Modelo B: `prefers-color-scheme` (sistema)

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

### Modelo C: toggle dinâmico pelo usuário

```tsx
// layout.tsx
<html lang="pt-BR" className={theme}>
```

```css
:root {
  --color-background: #ffffff;
  --color-foreground: #09090b;
}

.dark {
  --color-background: #09090b;
  --color-foreground: #fafafa;
}
```

---

## Passo 3 — Diagnostique a causa raiz

| Sintoma                               | Causa provável                                                   |
| ------------------------------------- | ---------------------------------------------------------------- |
| Texto invisível no dark mode          | Classe fixa (`text-gray-900`, `text-black`) sem variante `dark:` |
| Fundo claro aparecendo no dark        | `bg-white` ou `bg-gray-100` hardcoded                            |
| Dark mode não ativa em nada           | Classe `dark` ausente no `<html>`                                |
| Conflito `dark:` vs sistema           | `darkMode: "class"` no config sem a classe `dark` no HTML        |
| Animação Framer Motion com cor errada | Cor hardcoded no `animate` ou `initial`                          |

Sempre identifique a causa antes de propor a solução.

---

## Passo 4 — Aplique as correções

### Classes semânticas — substituições obrigatórias

| Situação                      | Classe correta            | Nunca use                            |
| ----------------------------- | ------------------------- | ------------------------------------ |
| Texto principal               | `text-foreground`         | `text-black`, `text-gray-900`        |
| Texto secundário              | `text-muted-foreground`   | `text-gray-500`, `text-gray-600`     |
| Fundo da página               | `bg-background`           | `bg-white`, `bg-gray-50`             |
| Fundo de card                 | `bg-card`                 | `bg-white`, `bg-gray-100`            |
| Bordas                        | `border-border`           | `border-gray-200`, `border-gray-300` |
| Texto em botão primário       | `text-primary-foreground` | `text-white`                         |
| Fundo de botão primário       | `bg-primary`              | `bg-black`, `bg-blue-600`            |
| Elementos sutis/desabilitados | `text-muted-foreground`   | `text-gray-400`                      |

### Regras inegociáveis

1. Nunca use `text-black`, `text-white`, `bg-white`, `bg-black` hardcoded — sempre variáveis semânticas
2. Nunca adicione `dark:text-*` em cima de uma classe fixa — remova a classe fixa e use semântica
3. Toda cor no `@theme` deve ter um par semântico claro (foreground, background, muted, etc.)
4. A classe `dark` no `<html>` é obrigatória para dark mode fixo — sem ela, nenhum `dark:` funciona
5. Nunca misture `darkMode: "class"` com `prefers-color-scheme` no CSS — escolha um modelo e mantenha consistente

### Framer Motion

Garanta que as variáveis `var(--color-*)` estejam corretamente definidas no `globals.css`. Para as animações em si, oriente o uso de variáveis em vez de valores hardcoded:

```tsx
// ❌ Errado
animate={{ color: "#000000" }}

// ✅ Correto
animate={{ color: "var(--color-foreground)" }}
```

---

## Passo 5 — Entregue o resultado

Para cada correção, entregue sempre:

1. **Diagnóstico** — qual é a causa raiz
2. **Arquivos a alterar** — lista exata dos arquivos e o que muda em cada um
3. **Código pronto** — substituições completas, sem deixar nada pela metade
4. **Verificação** — o que checar para confirmar que funcionou

---

## Escopo desta skill

**Faz:** variáveis de cor, classes semânticas, configuração de dark mode, `globals.css`, `layout.tsx`, `tailwind.config.ts`.

**Não faz:** definir paletas ou tomar decisões de identidade visual, escrever componentes React do zero, configurar Tailwind além de tema/dark mode, tocar na lógica de animações Framer Motion.

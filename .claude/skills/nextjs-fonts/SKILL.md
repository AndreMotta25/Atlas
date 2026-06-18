---
name: nextjs-fonts
description: Padrões e convenções para configurar fontes em Next.js com next/font/google e Tailwind CSS. Use esta skill sempre que o usuário precisar adicionar, trocar ou configurar fontes no projeto. Também use quando mencionar Google Fonts, next/font, variável CSS de fonte, font-family no Tailwind, ou quando perceber que o projeto ainda não tem fontes configuradas.
---

# Next.js Fonts

## Regra principal

Fontes sempre via `next/font/google` no `src/app/layout.tsx`. Nunca usar tag `<link>` para importar fontes externas.

```typescript
// ❌ Nunca fazer
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet" />

// ✅ Correto
import { Inter } from 'next/font/google'
```

---

## Configuração completa

### 1. Declarar as fontes e expor variáveis CSS

```typescript
// src/app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { Inter, Poppins } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${poppins.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
```

### 2. Registrar no Tailwind

```typescript
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        heading: ["var(--font-poppins)", "sans-serif"],
      },
    },
  },
};

export default config;
```

### 3. Usar nos componentes

```typescript
// font-sans → aplicada via body no layout (herança automática)
// font-heading → aplicar explicitamente onde necessário

<h1 className="font-heading font-bold text-3xl">Título</h1>
<p className="font-sans text-base">Parágrafo com fonte padrão.</p>
```

---

## Fontes com subsets não-latinos

Para projetos que usam caracteres fora do alfabeto latino, adicionar o subset correspondente:

```typescript
const inter = Inter({
  subsets: ["latin", "latin-ext"], // pt-BR com caracteres especiais
  variable: "--font-inter",
  display: "swap",
});
```

---

## Checklist

- [ ] Fontes importadas de `next/font/google`, sem `<link>` no HTML
- [ ] Cada fonte com `variable` e `display: 'swap'`
- [ ] Variáveis CSS aplicadas na tag `<html>` via `className`
- [ ] `fontFamily` registrado no `tailwind.config.ts`
- [ ] `font-sans` aplicado no `<body>` do layout
- [ ] Subset correto para o idioma do projeto

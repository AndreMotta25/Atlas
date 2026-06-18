---
name: nextjs-seo
description: Padrões e convenções para SEO em Next.js com App Router — metadata, Open Graph, robots.txt e sitemap. Use esta skill sempre que o usuário precisar configurar SEO, metadata de página, compartilhamento social, robots.txt, sitemap.xml ou qualquer aspecto de indexação. Também use quando mencionar generateMetadata, openGraph, metadataBase, robots.ts, sitemap.ts, ou quando criar qualquer page.tsx nova que precise ser indexável.
---

# Next.js SEO

## Regra principal

Todo `page.tsx` deve exportar `metadata` (estático) ou `generateMetadata` (dinâmico). Sem exceção.

---

## 1. Metadata estático

Para páginas com conteúdo fixo — home, about, listagens:

```typescript
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Título da Página",
  description: "Descrição com 150–160 caracteres.",
  openGraph: {
    title: "Título da Página",
    description: "Descrição para compartilhamento social.",
    images: [{ url: "/og/pagina.png", width: 1200, height: 630 }],
  },
};
```

---

## 2. Metadata dinâmico

Para páginas geradas a partir de dados — posts, produtos, perfis:

```typescript
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  try {
    const post = await fetchPostBySlug(params.slug);
    return {
      title: post.title,
      description: post.excerpt ?? "",
      openGraph: {
        title: post.title,
        description: post.excerpt ?? "",
        images: post.coverImage
          ? [{ url: post.coverImage, width: 1200, height: 630 }]
          : [],
      },
    };
  } catch {
    return { title: "Não encontrado" };
  }
}
```

---

## 3. Root layout — `metadataBase` e template de título

Configurar uma vez no `src/app/layout.tsx`. O `metadataBase` é obrigatório para que URLs de Open Graph funcionem corretamente:

```typescript
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: {
    default: process.env.NEXT_PUBLIC_APP_NAME ?? "MyApp",
    template: `%s | ${process.env.NEXT_PUBLIC_APP_NAME ?? "MyApp"}`,
  },
  description: "Descrição padrão da aplicação.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  openGraph: { type: "website", locale: "pt_BR" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#2563eb",
};
```

---

## 4. `robots.ts` — sempre criar

```typescript
// src/app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/api/"], // adaptar ao projeto
    },
    sitemap: `${process.env.NEXT_PUBLIC_APP_URL}/sitemap.xml`,
  };
}
```

---

## 5. `sitemap.ts` — criar apenas se houver conteúdo público indexável

```typescript
// src/app/sitemap.ts
import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const posts = await fetchPublishedPosts(1000);

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    ...posts.map((post) => ({
      url: `${baseUrl}/posts/${post.slug}`,
      lastModified: new Date(post.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
```

---

## Checklist antes de entregar

- [ ] Todo `page.tsx` exporta `metadata` ou `generateMetadata`
- [ ] `metadataBase` configurado no root layout
- [ ] Template de título configurado (`%s | AppName`)
- [ ] `viewport` com `maximumScale: 1` no root layout
- [ ] `robots.ts` criado com rotas privadas em `disallow`
- [ ] `sitemap.ts` criado se houver conteúdo público indexável
- [ ] Imagens de Open Graph com 1200×630px
- [ ] `generateMetadata` com `try/catch` para tratar página não encontrada

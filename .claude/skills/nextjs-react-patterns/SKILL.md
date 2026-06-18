---
name: nextjs-react-patterns
description: Padrões React para Next.js com App Router — como estruturar componentes, decidir entre Server e Client Component, buscar dados, compor Suspense e criar skeletons. Use esta skill sempre que o usuário precisar tomar decisões de arquitetura de componentes, organizar uma página, estruturar loading states ou aplicar boas práticas React no App Router. Também use quando mencionar 'use client', useEffect para fetch, Suspense, skeleton, async component, interface vs type, ou qualquer padrão de composição de componentes.
---

# Next.js Server Components

## Regra principal

**Server Component é o padrão.** Só adicionar `'use client'` quando o componente precisar de:

| Precisa de                                       | Usar             |
| ------------------------------------------------ | ---------------- |
| Eventos interativos (`onClick`, `onChange`…)     | `'use client'`   |
| Hooks de estado (`useState`, `useReducer`)       | `'use client'`   |
| Hooks de efeito (`useEffect`, `useLayoutEffect`) | `'use client'`   |
| APIs do browser (`window`, `localStorage`…)      | `'use client'`   |
| Apenas renderização e busca de dados             | Server Component |

---

## Busca de dados — direto no Server Component

**Nunca** buscar dados com `useEffect`. Buscar diretamente no componente assíncrono:

```typescript
// ✅ Correto — async Server Component
async function ProductList() {
  const products = await fetchProducts() // chamada direta, sem useEffect

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <li key={product.id} className="rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-lg">{product.name}</h2>
        </li>
      ))}
    </ul>
  )
}

// ❌ Nunca fazer em Server Component
useEffect(() => {
  fetch('/api/products').then(...)
}, [])
```

---

## Suspense — isolar partes assíncronas

Envolver cada Server Component que busca dados em `Suspense` com um skeleton dedicado. Isso evita que uma parte lenta bloqueie a página inteira.

```typescript
// src/app/products/page.tsx
import { Suspense } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Produtos',
  description: 'Listagem de produtos',
}

async function ProductList() {
  const products = await fetchProducts()

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <li key={product.id} className="rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
          <h2 className="font-semibold text-lg">{product.name}</h2>
          <p className="text-sm text-gray-500 mt-1">{product.description}</p>
        </li>
      ))}
    </ul>
  )
}

function ProductListSkeleton() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="rounded-xl border border-gray-200 p-5 animate-pulse">
          <div className="h-5 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-1/2 mt-2" />
        </li>
      ))}
    </ul>
  )
}

export default function ProductsPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Produtos</h1>
      <Suspense fallback={<ProductListSkeleton />}>
        <ProductList />
      </Suspense>
    </main>
  )
}
```

---

## Múltiplos Suspense na mesma página

Quando a página tem seções independentes, cada uma ganha seu próprio `Suspense` — carregam em paralelo sem bloquear uma à outra:

```typescript
export default function DashboardPage() {
  return (
    <main className="container mx-auto px-4 py-8 space-y-8">
      <Suspense fallback={<MetricsSkeleton />}>
        <MetricsSection />
      </Suspense>

      <Suspense fallback={<RecentOrdersSkeleton />}>
        <RecentOrders />
      </Suspense>
    </main>
  )
}
```

---

## Padrão de skeleton

Skeletons devem espelhar o layout real do componente — mesma estrutura, mesmas proporções:

```typescript
// ✅ Skeleton que reflete o layout real
function CardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 p-5 animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
      <div className="h-8 bg-gray-200 rounded w-1/4" />
    </div>
  )
}

// ❌ Skeleton genérico que não representa o conteúdo
function BadSkeleton() {
  return <div className="h-32 bg-gray-200 animate-pulse rounded" />
}
```

---

## TypeScript — interface vs type

```typescript
// interface → props de componentes e contratos
interface ProductCardProps {
  id: string;
  name: string;
  price: number;
  className?: string;
}

// type → uniões e interseções
type Status = "active" | "inactive" | "pending";
type AdminUser = User & { permissions: string[] };
```

---

## Checklist antes de entregar uma página

- [ ] Página exporta `metadata` ou `generateMetadata`
- [ ] Dados buscados diretamente no async Server Component, sem `useEffect`
- [ ] Cada seção assíncrona envolta em `Suspense` com skeleton dedicado
- [ ] Skeleton espelha o layout real do componente
- [ ] `'use client'` usado apenas onde estritamente necessário
- [ ] `interface` para props, `type` para uniões e interseções
- [ ] Nenhum `any` no TypeScript

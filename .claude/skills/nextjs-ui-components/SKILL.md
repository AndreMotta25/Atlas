---
name: nextjs-ui-components
description: Padrões e convenções para criar componentes de UI reutilizáveis em Next.js com Tailwind CSS. Use esta skill sempre que o usuário precisar criar ou modificar qualquer componente em components/ui/ — botões, inputs, modais, badges, cards, ou qualquer elemento visual reutilizável. Também use quando mencionar cn(), clsx, tailwind-merge, forwardRef, variantes de componente, className prop, ou quando precisar estruturar um componente que será usado em múltiplos lugares.
---

# Next.js UI Components

## Setup obrigatório — `cn()` helper

Todo projeto deve ter este utilitário. Criar antes de qualquer componente:

```typescript
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Instalar as dependências:

```bash
npm install clsx tailwind-merge
```

---

## Anatomia de um componente `components/ui/`

Todo componente desta pasta deve seguir estas três regras sem exceção:

1. **Aceitar `className` como prop** — para permitir customização pelo consumidor
2. **Usar `cn()`** para mesclar classes base com as classes recebidas
3. **Usar `forwardRef`** quando envolver um elemento HTML nativo

```typescript
// Estrutura base — adaptar para cada componente
import { cn } from '@/lib/utils'
import { forwardRef, HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  // props adicionais aqui
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-xl border border-gray-200 p-5', className)}
      {...props}
    >
      {children}
    </div>
  )
)
Card.displayName = 'Card'
```

---

## Variantes — sempre lookup object, nunca ternários encadeados

```typescript
// ✅ Correto
const variants = {
  primary:   'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-300',
  ghost:     'text-gray-700 hover:bg-gray-100 focus:ring-gray-200',
  danger:    'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
}

// ❌ Nunca fazer
className={variant === 'primary' ? 'bg-blue-600' : variant === 'secondary' ? '...' : '...'}
```

---

## Exemplo completo — Button

Referência canônica para qualquer componente com variantes e estado de loading:

```typescript
// src/components/ui/button.tsx
import { cn } from '@/lib/utils'
import { forwardRef, ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const variants = {
  primary:   'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-300',
  ghost:     'text-gray-700 hover:bg-gray-100 focus:ring-gray-200',
  danger:    'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm min-h-[36px]',
  md: 'px-4 py-2 text-base min-h-[44px]',
  lg: 'px-6 py-3 text-lg min-h-[52px]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && (
        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
)
Button.displayName = 'Button'
```

---

## Mobile — regras aplicadas a todo componente interativo

- Botões e elementos clicáveis: `min-h-[44px] min-w-[44px]`
- Inputs: sempre `text-base` (16px) — previne auto-zoom no iOS
- Padding horizontal mínimo em páginas: `px-4`

---

## Checklist antes de entregar um componente

- [ ] Aceita `className` como prop
- [ ] Usa `cn()` para mesclar classes
- [ ] Usa `forwardRef` se envolver elemento HTML nativo
- [ ] `.displayName` definido (necessário para React DevTools)
- [ ] Variantes em lookup object, sem ternários encadeados
- [ ] `min-h-[44px]` em elementos interativos
- [ ] Nenhum `style={{}}` exceto para valores verdadeiramente dinâmicos
- [ ] Nenhum `any` no TypeScript

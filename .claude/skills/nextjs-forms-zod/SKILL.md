---
name: nextjs-forms-zod
description: Padrões e convenções para formulários em Next.js com React Hook Form e Zod. Use esta skill sempre que o usuário precisar criar, modificar ou estruturar qualquer formulário — seja login, cadastro, edição de dados, multi-step, ou qualquer input de dados pelo usuário. Também use quando mencionar validação, schema Zod, resolver, useForm, erros de campo, submissão de formulário, FormData ou integração com Server Actions.
---

# Next.js Forms — React Hook Form + Zod

## Stack obrigatória

| Biblioteca            | Papel                                       |
| --------------------- | ------------------------------------------- |
| `react-hook-form`     | Estado, validação e submissão do formulário |
| `zod`                 | Schema de validação (client e server)       |
| `@hookform/resolvers` | Ponte entre RHF e Zod                       |

## Localização dos arquivos

```
src/
├── lib/
│   └── validations/        # Schemas Zod — um arquivo por entidade
│       ├── auth.ts
│       ├── user.ts
│       └── product.ts
└── app/
    └── [rota]/
        ├── page.tsx
        └── actions.ts      # Validação server-side + lógica de mutação
```

---

## 1. Schema Zod (`src/lib/validations/[entidade].ts`)

- Um arquivo por entidade/domínio
- Sempre exportar o tipo inferido junto com o schema
- Usar mensagens de erro em português quando o projeto for pt-BR

```typescript
// src/lib/validations/auth.ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string({ required_error: "Campo obrigatório" })
    .email("E-mail inválido")
    .toLowerCase(),
  password: z
    .string({ required_error: "Campo obrigatório" })
    .min(6, "Mínimo de 6 caracteres"),
});

export type LoginInput = z.infer<typeof loginSchema>;
```

---

## 2. Componente de formulário (`'use client'`)

```typescript
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginInput } from '@/lib/validations/auth'

export function LoginForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginInput) {
    const fd = new FormData()
    Object.entries(data).forEach(([k, v]) => fd.append(k, v))
    // chamar a Server Action aqui
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 w-full max-w-sm mx-auto">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          {...register('email')}
        />
        {errors.email && (
          <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Senha
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          {...register('password')}
        />
        {errors.password && (
          <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full min-h-[44px] rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {isSubmitting ? 'Carregando...' : 'Entrar'}
      </button>
    </form>
  )
}
```

---

## 3. Server Action (`src/app/[rota]/actions.ts`)

Sempre revalidar no servidor — nunca confiar apenas na validação do cliente.

```typescript
"use server";

import { loginSchema } from "@/lib/validations/auth";
import { revalidatePath } from "next/cache";

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  try {
    // lógica de negócio aqui (ex: chamar /api/auth via fetch interno)
    revalidatePath("/");
    return { data: { ok: true } };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
```

---

## Checklist antes de entregar um formulário

- [ ] Schema Zod em `src/lib/validations/`
- [ ] Tipo inferido exportado (`z.infer<typeof schema>`)
- [ ] `resolver: zodResolver(schema)` no `useForm`
- [ ] Todos os campos com `{...register('campo')}`
- [ ] Mensagens de erro renderizadas abaixo de cada campo
- [ ] Botão de submit com `disabled={isSubmitting}` e feedback visual
- [ ] `text-base` em todos os inputs (previne zoom no iOS)
- [ ] `min-h-[44px]` no botão de submit (touch target)
- [ ] Validação com `safeParse` na Server Action
- [ ] Nenhum `any` no TypeScript

## Regras de ouro

- **NUNCA** usar `any` nos tipos dos dados do formulário
- **NUNCA** confiar só na validação do cliente — sempre revalidar na Server Action
- **NUNCA** expor erros internos do servidor para o cliente
- Colocar o schema no arquivo de validações, **não** dentro do componente

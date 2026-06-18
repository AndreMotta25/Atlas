---
name: supabase-database
description: "Use quando a tarefa envolver escrita de SQL ou qualquer menção a: migrations, políticas RLS, índices, foreign keys, triggers, Supabase CLI ou geração de tipos TypeScript a partir do schema do banco."
---

## Regras inegociáveis

1. Toda mudança de schema é uma migration em `supabase/migrations/` — nunca pelo painel
2. Nunca edite uma migration já aplicada — crie sempre uma nova
3. Toda tabela nova deve ter RLS habilitado e ao menos uma policy explícita
4. Policies com `auth.uid()` apenas se o projeto usa Supabase Auth — nunca assuma autenticação
5. Todo `updated_at` deve ter um trigger — a função `set_updated_at` é criada uma vez por projeto e reutilizada
6. Sempre crie índices em colunas de FK — o PostgreSQL não indexa FKs automaticamente
7. Primary key padrão: `uuid default gen_random_uuid()`
8. Regenere `src/types/database.types.ts` após cada migration
9. `snake_case` para todos os identificadores do banco

## Estrutura obrigatória de toda migration

```sql
-- ============================================================
-- Migration: <timestamp>_<descricao>.sql
-- Description: O que esta migration faz e por quê
-- ============================================================

-- 1. TABELA
create table if not exists public.<tabela> (
  id          uuid primary key default gen_random_uuid(),
  -- user_id  uuid not null references auth.users(id) on delete cascade, -- só com Supabase Auth
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. ÍNDICES
create index if not exists <tabela>_<coluna>_idx on public.<tabela>(<coluna>);

-- 3. TRIGGER DE updated_at
-- Crie set_updated_at() uma vez por projeto. Nas migrations seguintes, pule o CREATE FUNCTION.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger <tabela>_updated_at
  before update on public.<tabela>
  for each row execute function public.set_updated_at();

-- 4. RLS
alter table public.<tabela> enable row level security;
```

## Padrões de Policy RLS

**Padrão A — Com Supabase Auth**

```sql
create policy "<tabela>: usuario le proprio"      on public.<tabela> for select using (auth.uid() = user_id);
create policy "<tabela>: usuario insere proprio"  on public.<tabela> for insert with check (auth.uid() = user_id);
create policy "<tabela>: usuario atualiza proprio" on public.<tabela> for update using (auth.uid() = user_id);
create policy "<tabela>: usuario deleta proprio"  on public.<tabela> for delete using (auth.uid() = user_id);
```

**Padrão B — Sem auth, leitura pública**

```sql
create policy "<tabela>: leitura publica" on public.<tabela> for select using (true);
-- Sem insert/update/delete = cliente não pode escrever
```

**Padrão C — Sem auth, contexto da aplicação**

```sql
create policy "<tabela>: contexto da aplicacao" on public.<tabela> for all
  using (user_id = current_setting('app.current_user_id')::uuid);
```

**Padrão D — Multi-role (público + privado)**

```sql
create policy "<tabela>: linhas publicas" on public.<tabela> for select using (is_public = true);
create policy "<tabela>: dono le privado" on public.<tabela> for select using (auth.uid() = user_id);
create policy "<tabela>: dono escreve"    on public.<tabela> for all    using (auth.uid() = user_id);
```

## Tipos de coluna recomendados

| Caso de uso              | Tipo recomendado                     | Observação                                       |
| ------------------------ | ------------------------------------ | ------------------------------------------------ |
| Primary key              | `uuid default gen_random_uuid()`     | Padrão em todo projeto                           |
| ID sequencial/ordenado   | `bigserial`                          | Quando ordem de inserção importa                 |
| Texto (qualquer tamanho) | `text`                               | Use `check (char_length(col) <= N)` para limitar |
| Flag booleana            | `boolean not null default false`     | Sempre com default explícito                     |
| Timestamps               | `timestamptz not null default now()` | Sempre com fuso horário                          |
| Dinheiro / decimais      | `numeric(12, 2)`                     | Nunca `float` para valores monetários            |
| Dados JSON               | `jsonb`                              | Nunca `json` — `jsonb` é indexável               |
| Enum simples             | `text check (col in ('a','b','c'))`  | Preferível a `enum` para facilitar ALTER         |
| Enum formal              | `create type ... as enum (...)`      | Use quando os valores são fixos e bem definidos  |
| Arquivo/imagem           | `text` (URL ou path do Storage)      | Nunca armazene binário na tabela                 |

## Foreign Keys — estratégias on delete

Sempre defina explicitamente. Nunca deixe o padrão implícito.

```sql
-- Cascade: filho deletado junto com o pai
references auth.users(id) on delete cascade

-- Set null: referência vira null, filho sobrevive
references public.categories(id) on delete set null

-- Restrict: bloqueia deleção do pai enquanto houver filhos
references public.products(id) on delete restrict
```

## Índices — quando e como criar

```sql
-- FK: sempre
create index if not exists orders_user_id_idx on public.orders(user_id);

-- Composto: queries que filtram por múltiplas colunas juntas
create index if not exists orders_status_created_idx on public.orders(status, created_at desc);

-- Parcial: quando só uma fração das linhas é consultada
create index if not exists posts_published_created_idx on public.posts(created_at desc)
  where published = true;

-- Único: unicidade que não é PK
create unique index if not exists profiles_email_unique on public.profiles(email);
```

## Workflow CLI

```bash
supabase migration new nome_descritivo
supabase db reset                        # reaplica tudo localmente
supabase migration up                    # aplica apenas pendentes
supabase db lint --schema public         # valida antes de subir
supabase gen types --local > src/types/database.types.ts
supabase db push --dry-run
supabase db push
```

## Tipos TypeScript — nunca escreva manualmente

```typescript
import type { Database } from "@/types/database.types";

type Product = Database["public"]["Tables"]["products"]["Row"];
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];
```

## Environment Variables

- Para trabalhar com o Supabase, você precisará configurar as seguintes variáveis de ambiente:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
- Essas variaveis só podem ser usadas na parte das API Routes do next.js, ou seja, não podem ser usadas diretamente no frontend. Se precisar de dados do banco no frontend.

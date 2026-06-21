# Atlas — Especificação Técnica de Arquitetura

> App Electron estilo Notion/Obsidian com IA integrada (DeepSeek e outros).
> Spec original em `spec.md`. Este documento detalha a arquitetura técnica.

---

## 1. Visão Geral

O Atlas é um app desktop (Electron) para notas e conhecimento pessoal, com:

- **Editor** Markdown puro baseado em CodeMirror.
- **Armazenamento híbrido**: páginas como arquivos `.md` no disco + SQLite para metadados, links e índices.
- **IA multi-provider** com chat lateral capaz de **ler, criar e editar** páginas.
- **Autonomia controlada**: a IA sempre pede confirmação antes de aplicar mudanças.

---

## 2. Pilares do Produto

### 2.1 Editor (estilo Obsidian)
- Edição Markdown crua, sem renderização rica.
- Syntax highlighting e atalhos via CodeMirror 6.
- Preview lado-a-lado (opcional).
- Wiki-links (`[[pagina]]`) e tags (`#tag`) suportadas.

### 2.2 Armazenamento Híbrido
- **Conteúdo**: arquivos `.md` numa pasta "vault" escolhida pelo usuário. Portátil, versionável em git, legível fora do app.
- **Metadados** (SQLite via `better-sqlite3`):
  - Índice de páginas (caminho, título, mtime).
  - Grafo de links (`[[pagina]]` → pagina-alvo).
  - Tags e backlinks.
  - Índice full-text search (FTS5).
- **Sincronização**: file watcher observa o vault e atualiza o SQLite automaticamente.

### 2.3 IA Multi-Provider (Vercel AI SDK)
- Interface comum do Vercel AI SDK (`LanguageModel`) — todos providers falam a mesma API.
- **Providers iniciais**:
  - **DeepSeek** via `@ai-sdk/openai` com `createOpenAI({ baseURL: 'https://api.deepseek.com' })`.
  - **OpenAI** via `@ai-sdk/openai`.
  - **Anthropic** via `@ai-sdk/anthropic`.
  - **Ollama** (local) via `@ai-sdk/openai-compatible`.
- **Tool calling nativo** com `generateText` / `streamText` — define `tools` no main process; o SDK orquestra as chamadas.
- **Streaming** via `streamText` → eventos repassados ao renderer por IPC (não há camada SSE manual).
- Usuário configura API key por provider nas settings.
- Provider ativo é selecionável por sessão/chat.

### 2.4 Autonomia — Sempre Confirmar
- A IA nunca escreve direto no disco ou no editor.
- Quando ela quer agir, propõe uma **operação** (criar/editar/ler página) que aparece como um card no chat.
- Usuário clica **Aceitar** / **Rejeitar** / **Editar** antes de aplicar.
- Cada operação tem **undo** via snapshot do estado anterior.

---

## 3. Stack Tecnológica

### 3.1 Núcleo
| Camada | Tecnologia | Por quê |
|---|---|---|
| Shell desktop | **Electron 30+** | Padrão, multi-OS, ecossistema maduro |
| Build/empacotamento | **electron-builder** ou **electron-forge** | Instaladores win/mac/linux |
| TypeScript | **5.x** | Type-safety ponta-a-ponta |
| Bundler renderer | **Vite** | Fast HMR, moderno |

### 3.2 Frontend (renderer)
| Função | Tecnologia |
|---|---|
| UI framework | **React 18** |
| Editor | **CodeMirror 6** (`@codemirror/lang-markdown`) |
| Estilos | **Tailwind CSS** |
| Estado | **Zustand** (leve) ou **Redux Toolkit** |
| Chat UI | componente custom + **react-markdown** p/ renderizar respostas |
| Routing | **React Router** ou hash-based |

### 3.3 Backend (main process)
| Função | Tecnologia |
|---|---|
| DB | **better-sqlite3** (síncrono, rápido) |
| FTS | SQLite **FTS5** |
| File watching | **chokidar** |
| FS API | Node `fs/promises` |
| IPC | Electron `contextBridge` + `ipcMain`/`ipcRenderer` |
| AI SDK | **Vercel AI SDK** (`ai` + adapters `@ai-sdk/*`) |
| Adapters | `@ai-sdk/openai` (DeepSeek via baseURL + OpenAI), `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible` (Ollama) |
| Streaming de tokens | `streamText` no main process → repassado ao renderer via IPC |

### 3.4 Ferramentas
| Função | Tecnologia |
|---|---|
| Lint | **ESLint** + **Prettier** |
| Testes | **Vitest** (unit) + **Playwright** (e2e, opcional) |
| Ícones | **lucide-react** |
| Markdown utils | **remark** + **unified** (parsing de links/tags) |

---

## 4. Arquitetura de Processos

```
┌─────────────────────────────────────────┐
│ Main Process (Node.js)                  │
│  ├─ VaultManager     (FS + file watch)  │
│  ├─ DatabaseService  (SQLite + FTS5)    │
│  ├─ LinkIndexer      ([[links]]/tags)   │
│  ├─ AIOrchestrator   (Vercel AI SDK)   │
│  ├─ ToolExecutor     (aplica mudanças)  │
│  └─ IPC handlers                       │
└──────────────┬──────────────────────────┘
               │ contextBridge (seguro, sem nodeIntegration)
┌──────────────┴──────────────────────────┐
│ Renderer Process (React + CodeMirror)   │
│  ├─ EditorView                          │
│  ├─ Sidebar (árvore de páginas)         │
│  ├─ ChatPanel                           │
│  │   └─ PendingActions (cards confirm)  │
│  └─ Settings                            │
└─────────────────────────────────────────┘
```

**Segurança**: `contextIsolation: true`, `nodeIntegration: false`, CSP estrito. Toda comunicação via canais IPC explícitos.

---

## 5. Ferramentas (Tools) da IA

A IA age chamando "ferramentas" (function calling). Cada chamada vira um card de confirmação.

| Tool | Descrição | Entradas |
|---|---|---|
| `read_page` | Lê o conteúdo de uma página | `path` ou `title` |
| `create_page` | Cria nova página | `path`, `content` |
| `edit_page` | Edita página (substituição de trecho ou arquivo inteiro) | `path`, `diff/patch` ou `newContent` |
| `list_pages` | Lista páginas por tag/pasta/busca | `query`, `filter` |
| `search` | Busca full-text no vault | `query` |
| `get_backlinks` | Páginas que apontam para a atual | `path` |

**Fluxo de confirmação**:
1. IA decide chamar `edit_page`.
2. Main process gera um diff visual.
3. Renderer mostra card: "IA quer editar `notas.md` — [ver diff] [Aceitar] [Rejeitar]".
4. Ao aceitar, ToolExecutor aplica no `.md`, file watcher reindexa SQLite.

---

## 6. Modelo de Dados (SQLite)

```sql
-- Páginas
CREATE TABLE pages (
  id          INTEGER PRIMARY KEY,
  path        TEXT UNIQUE,        -- caminho relativo dentro do vault
  title       TEXT,
  mtime       INTEGER,
  size        INTEGER
);

-- Links ([[a]] -> b)
CREATE TABLE links (
  from_page   INTEGER REFERENCES pages(id),
  to_path     TEXT,                -- pode apontar p/ página inexistente
  anchor      TEXT
);

-- Tags
CREATE TABLE tags (
  page_id     INTEGER REFERENCES pages(id),
  tag         TEXT
);

-- Full-text search
CREATE VIRTUAL TABLE pages_fts USING fts5(
  path, title, content,
  content='pages', content_rowid='id'
);
```

---

## 7. Fluxo da IA (alto nível)

```
Usuário escreve no chat:
  "crie uma página sobre x vinculando a [[y]]"

→ AIOrchestrator (main) chama streamText() do Vercel AI SDK
   com provider ativo (DeepSeek) e tools definidas
   system prompt: "Você é assistente do vault.
    Use as tools disponíveis. Sempre explique antes de agir."

→ streamText detecta tool_call → repassa p/ handler
   O handler NÃO aplica direto — gera preview e emite
   evento IPC "tool_pending" p/ o renderer

→ Card aparece no chat p/ confirmação
   [Aceitar] [Rejeitar] [Editar]

→ Usuário aceita → ToolExecutor (main) aplica no disco
                → chokidar detecta mudança
                → SQLite reindexa
                → callback de tool result enviado ao streamText
                → IA continua o diálogo com o resultado
```

---

## 8. Estrutura de Pastas (proposta)

```
Atlas/
├─ package.json
├─ electron/                  # main process
│  ├─ main.ts
│  ├─ preload.ts
│  ├─ db/
│  │  ├─ schema.sql
│  │  └─ index.ts
│  ├─ vault/
│  │  ├─ manager.ts          # FS + watch
│  │  └─ indexer.ts          # parse links/tags
│  ├─ ai/
│  │  ├─ orchestrator.ts          # streamText/generateText
│  │  ├─ providers/
│  │  │  ├─ deepseek.ts           # @ai-sdk/openai c/ baseURL
│  │  │  ├─ openai.ts
│  │  │  ├─ anthropic.ts          # @ai-sdk/anthropic
│  │  │  └─ ollama.ts             # @ai-sdk/openai-compatible
│  │  └─ tools/
│  │     ├─ read.ts
│  │     ├─ create.ts
│  │     └─ edit.ts
│  └─ ipc/
│     └─ handlers.ts
├─ src/                       # renderer (React)
│  ├─ App.tsx
│  ├─ components/
│  │  ├─ Editor.tsx          # CodeMirror
│  │  ├─ Sidebar.tsx
│  │  ├─ ChatPanel.tsx
│  │  └─ ConfirmCard.tsx
│  ├─ stores/                # zustand
│  └─ lib/
│     └─ api.ts              # wrapper p/ IPC
└─ vite.config.ts
```

---

## 9. Riscos e Decisões a Confirmar

- **Diff/patch**: editar trechos de MD é frágil (espaços, listas). Definir se editamos por **substituição total** ou por **diff semântico**. Sugestão: começar com substituição total da página inteira no MVP.
- **Context window**: vaults grandes não cabem. Estratégia: RAG via FTS5 — buscar trechos relevantes e injetar, não carregar tudo.
- **Embeddings**: opcional no futuro, p/ busca semântica. DeepSeek não gera embeddings; usar OpenAI ou modelo local.
- **Multi-janela**: fora do MVP.
- **Sync entre dispositivos**: fora do MVP (git manual ou sync de pasta).

---

## 10. Roadmap Sugerido (MVP → Completo)

**Fase 1 — MVP funcional**
- VaultManager + SQLite + indexer
- Editor CodeMirror com abertura/salvamento
- Sidebar com árvore de arquivos
- Provider DeepSeek funcionando (chat sem tools)
- Configurações com API key

**Fase 2 — IA com tools**
- Implementar tools `read/create/edit/list`
- Cards de confirmação no chat
- Undo de operações

**Fase 3 — Rico**
- Wiki-links + backlinks + grafo visual
- Tags e busca full-text
- Preview lado-a-lado

**Fase 4 — Multi-provider & RAG**
- Anthropic + Ollama adapters
- RAG com FTS5 para contexto
- (Opcional) embeddings p/ busca semântica

---

## 11. Pendências para Próxima Conversa

1. Definir política de diff (substituição total vs. patch).
2. Confirmar se queremos grafo visual estilo Obsidian (futuro).
3. Definir UX do chat: painel fixo direito? Drawer? Tela cheia?
4. Definir settings persistidas onde (JSON no `app.getPath('userData')`).
5. Decidir empacotamento (electron-builder vs forge).

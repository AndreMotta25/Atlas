# Atlas — Status do Projeto

> Acompanhamento de progresso. Especificação completa em `spec.md` e `architecture.md`.

Última atualização: **2026-06-18**

---

## Etapa atual

**Fase 1 (MVP) — ✅ Concluída** (escopo mínimo viável, sem SQLite).

App usável de ponta a ponta: escolher vault, navegar, editar Markdown com Live Preview, conversar com DeepSeek. Persistência de settings/keys em `userData`.

Próxima etapa prevista: **Fase 2 — IA com tools + SQLite** (ver "O que falta" abaixo).

---

## O que já está pronto

### Fase 1 — MVP

| Área | Implementado | Arquivos |
|---|---|---|
| Escolha de vault (dialog na 1ª execução) | ✅ | `src/vault/config_store.ts`, `vault_handlers.ts` |
| Watcher do vault (chokidar) | ✅ | `src/vault/manager.ts` |
| Árvore de arquivos (sidebar) | ✅ | `src/components/sidebar/file_tree.tsx` |
| Editor CodeMirror 6 (markdown) | ✅ | `src/components/editor/editor_pane.tsx` |
| Auto-save debounce 500ms | ✅ | `editor_pane.tsx` |
| Criar nova página | ✅ | `file_tree.tsx` |
| Chat DeepSeek com streaming | ✅ | `src/ai/orchestrator.ts`, `ai_handlers.ts`, `chat_store.ts` |
| Configurações (provider, API key, modelo) | ✅ | `src/components/settings/settings_modal.tsx` |
| API keys via `safeStorage` | ✅ | `src/vault/secure_store.ts` |
| IPC type-safe + preload namespaced | ✅ | `src/preload.ts`, `src/ipc/*` |

### Extras já entregues (originalmente previstos para fases posteriores)

| Extra | Status | Arquivos |
|---|---|---|
| **Live Preview estilo Obsidian** (Fase 3 → antecipado) | ✅ | `src/components/editor/live_preview.ts` |
| Esconder marcação + tipografia (H1–H6, bold, itálico, código, links, citações, listas, régua) | ✅ | `live_preview.ts`, `index.css` |
| Wiki-links `[[pagina]]` e tags `#tag` estilizados (regex) | ✅ | `live_preview.ts` |
| Cursor na linha → mostra markdown cru (igual Obsidian) | ✅ | `live_preview.ts` |
| **Menu de contexto (botão direito)** | ✅ | `src/components/editor/context_menu.tsx`, `markdown_actions.ts` |
| Ações: Títulos 1–3, Negrito, Itálico, Riscado, Código, Link, Citação, Lista, Régua, Recuo | ✅ | `markdown_actions.ts` |
| **Sem numeração de linhas** | ✅ | `editor_pane.tsx` |

---

## O que falta

### Fase 2 — IA com tools + SQLite (próxima)

- [ ] **SQLite** (`better-sqlite3`) — estava no escopo original da Fase 1, foi deferido.
  - Tabelas: `pages`, `links`, `tags`, `pages_fts` (FTS5).
  - Migration inicial + índices.
  - Ver `.claude/rules/SQLite.md` para padrões.
- [ ] **Indexer** — parse de `[[wiki-links]]` e `#tags` ao salvar; popular tabelas `links`/`tags`.
- [ ] **Tools da IA** (function calling via Vercel AI SDK):
  - `read_page`, `create_page`, `edit_page`, `list_pages`, `search`, `get_backlinks`.
- [ ] **Cards de confirmação no chat** — cada tool call vira um card `[Aceitar] [Rejeitar] [Editar]`.
  - `src/components/chat/confirm_card.tsx` (novo).
  - `ToolExecutor` no main que aplica mudanças só após aceitação.
- [ ] **Undo** de operações via snapshot do estado anterior.
- [ ] Política de **diff** (decidir entre substituição total vs patch — arquitetura sugere substituição total no MVP).

### Fase 3 — Rico

- [ ] Wiki-links **clicáveis** (hoje só estão estilizados, não abrem a página alvo).
- [ ] **Backlinks** (painel mostrando páginas que apontam para a atual).
- [ ] **Grafo visual** estilo Obsidian (a confirmar com usuário — arquitetura lista como ponto aberto).
- [ ] **Tags** como índice navegável (depende do SQLite da Fase 2).
- [ ] **Busca full-text** (FTS5) — painel de busca.
- [ ] **Preview lado-a-lado** (opcional, alternável).

### Fase 4 — Multi-provider & RAG

- [ ] Providers além do DeepSeek (atualmente o `AIOrchestrator` já distingue providers mas só DeepSeek está wired):
  - [ ] OpenAI (`@ai-sdk/openai`)
  - [ ] Anthropic (`@ai-sdk/anthropic`)
  - [ ] Ollama local (`@ai-sdk/openai-compatible`)
- [ ] **RAG via FTS5** para injetar trechos relevantes no contexto do chat (vaults grandes não cabem na context window).
- [ ] (Opcional) **Embeddings** para busca semântica.

### Pontos abertos (decisões de produto — arquitetura §9 e §11)

- [ ] Política de diff (substituição total vs patch semântico).
- [ ] Confirmar grafo visual sim/não.
- [ ] UX do chat: painel fixo direito (atual) vs drawer vs tela cheia.
- [ ] Empacotamento: `electron-builder` vs `electron-forge` (atualmente usa Forge).

---

## Stack atual

- Electron 42 · TypeScript 5.9 · Webpack (electron-forge) · React 19 · Tailwind 4
- CodeMirror 6 (`@codemirror/state|view|lang-markdown|commands|language|search`)
- Vercel AI SDK (`ai` + `@ai-sdk/openai`) — DeepSeek via `baseURL`
- chokidar (file watching) · zustand (estado) · react-markdown + remark-gfm (chat)
- safeStorage para credenciais · JSON em `userData` para settings

---

## Como rodar

```bash
npm start       # desenvolvimento
npm run lint    # ESLint
npm run package # executável da plataforma atual
npm run make    # instaladores
```

Smoke test manual:
1. `npm start` → se sem vault, dialog de onboarding aparece.
2. Abrir ou criar `.md` → editar (auto-save após 500ms).
3. Botão direito no editor → menu de formatação.
4. ⚙ nas settings → colar API key da DeepSeek → conversar no painel direito.

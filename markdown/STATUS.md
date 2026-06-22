# Atlas — Status do Projeto

> Acompanhamento de progresso. Especificação completa em `spec.md` e `architecture.md`.

Última atualização: **2026-06-19** (revisão: persistência de chat)

---

## Etapa atual

**Fase 2.5 — SQLite + Indexer — ✅ Concluída**

Vault agora tem índice SQLite (`better-sqlite3`) com FTS5, links `[[wiki-links]]`, tags `#tag` e busca full-text por conteúdo. Indexer roda em setRoot (rebuild completo) e incrementalmente a cada mudança observada pelo chokidar. A IA ganhou tools `search` (FTS5) e `get_backlinks`; a busca da sidebar agora usa FTS5 (instantânea, sem custo de LLM).

Próxima etapa prevista: **Fase 3 — Rico** (wiki-links clicáveis, painel de backlinks, busca FTS5 já disponível via tool). Ver "O que falta" abaixo.

---

## O que já está pronto

### Fase 1 — MVP

| Área                                      | Implementado | Arquivos                                                    |
| ----------------------------------------- | ------------ | ----------------------------------------------------------- |
| Escolha de vault (dialog na 1ª execução)  | ✅           | `src/vault/config_store.ts`, `vault_handlers.ts`            |
| Watcher do vault (chokidar)               | ✅           | `src/vault/manager.ts`                                      |
| Árvore de arquivos (sidebar)              | ✅           | `src/components/sidebar/file_tree.tsx`                      |
| Editor CodeMirror 6 (markdown)            | ✅           | `src/components/editor/editor_pane.tsx`                     |
| Auto-save debounce 500ms                  | ✅           | `editor_pane.tsx`                                           |
| Criar nova página                         | ✅           | `file_tree.tsx`                                             |
| Chat DeepSeek com streaming               | ✅           | `src/ai/orchestrator.ts`, `ai_handlers.ts`, `chat_store.ts` |
| Configurações (provider, API key, modelo) | ✅           | `src/components/settings/settings_modal.tsx`                |
| API keys via `safeStorage`                | ✅           | `src/vault/secure_store.ts`                                 |
| IPC type-safe + preload namespaced        | ✅           | `src/preload.ts`, `src/ipc/*`                               |

### Extras já entregues (originalmente previstos para fases posteriores)

| Extra                                                                                         | Status | Arquivos                                                        |
| --------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------- |
| **Live Preview estilo Obsidian** (Fase 3 → antecipado)                                        | ✅     | `src/components/editor/live_preview.ts`                         |
| Esconder marcação + tipografia (H1–H6, bold, itálico, código, links, citações, listas, régua) | ✅     | `live_preview.ts`, `index.css`                                  |
| Wiki-links `[[pagina]]` e tags `#tag` estilizados (regex)                                     | ✅     | `live_preview.ts`                                               |
| Cursor na linha → mostra markdown cru (igual Obsidian)                                        | ✅     | `live_preview.ts`                                               |
| **Menu de contexto (botão direito)**                                                          | ✅     | `src/components/editor/context_menu.tsx`, `markdown_actions.ts` |
| Ações: Títulos 1–3, Negrito, Itálico, Riscado, Código, Link, Citação, Lista, Régua, Recuo     | ✅     | `markdown_actions.ts`                                           |
| **Sem numeração de linhas**                                                                   | ✅     | `editor_pane.tsx`                                               |
| **Sistema de comentários** com highlights `==texto==<!--c:comentário-->`                      | ✅     | `editor_pane.tsx`, `comment_popup.tsx`, `chat_panel.tsx`        |
| **Temas claro/escuro/sistema** (`nativeTheme` ↔ `.dark`)                                      | ✅     | `theme_handlers.ts`, `use_theme.ts`, `index.css`                |
| Renomear páginas/pastas no vault                                                              | ✅     | `file_tree.tsx`                                                 |

### Fase 2 — IA com Tools (sem SQLite) — ✅ Concluída

| Área                                                                                           | Implementado | Arquivos                                                               |
| ---------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------- |
| **Tools de leitura** (`read_page`, `list_pages`) com auto-exec no stream                       | ✅           | `src/ai/tools.ts`, `orchestrator.ts`                                   |
| **Tools de escrita** (`create_page`, `edit_page`) com intercepção                              | ✅           | `tools.ts`, `orchestrator.ts`                                          |
| `edit_page` híbrido — `replace` / `append` / `replace_section`                                 | ✅           | `src/ai/tool_executor.ts`                                              |
| Detecção de heading para `replace_section` (preserva nível)                                    | ✅           | `tool_executor.ts`                                                     |
| **Cards de confirmação** no chat (Aceitar/Rejeitar/Desfazer)                                   | ✅           | `src/components/chat/confirm_card.tsx`, `message.tsx`                  |
| **Cards de resultado** para tools de leitura (preview do conteúdo)                             | ✅           | `src/components/chat/tool_result_card.tsx`                             |
| **DiffView** (LCS clássico, sem dep externa) — disponível p/ uso futuro                        | ✅           | `src/components/chat/diff_view.tsx`                                    |
| **Undo ring buffer** (N=10, restore ou delete)                                                 | ✅           | `tool_executor.ts`, `undo:last` IPC                                    |
| **Resume da conversa** após confirmação (two-call pattern AI SDK v6)                           | ✅           | `orchestrator.ts` (`runTurn`), `ai_handlers.ts` (`resumeConversation`) |
| `ConversationContext` mantido no main por `requestId`                                          | ✅           | `ai_handlers.ts`                                                       |
| System prompt atualizado com regras das tools                                                  | ✅           | `orchestrator.ts`                                                      |
| IPC type-safe: `tool:confirm`, `tool:reject`, `undo:last`, `ai:tool-pending`, `ai:tool-result` | ✅           | `tool_handlers.ts`, `preload.ts`                                       |

### Fase 2.5 — SQLite + Indexer — ✅ Concluída

| Área                                                                                           | Implementado | Arquivos                                                      |
| ---------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------- |
| **SQLite** (`better-sqlite3`) com schema `pages`/`links`/`tags`/`pages_fts`                    | ✅           | `src/vault/db.ts`                                             |
| Migration via `pragma user_version` + WAL mode                                                 | ✅           | `db.ts`                                                       |
| `better-sqlite3` marcado como externo no webpack main                                          | ✅           | `webpack.main.config.ts`                                      |
| **FTS5** com `unicode61 remove_diacritics 2` (busca accent-insensitive em PT)                  | ✅           | `db.ts`                                                       |
| **Indexer** — parse de `[[wiki-links]]` (com alias/heading) e `#tags`, respeitando code fences | ✅           | `src/vault/indexer.ts`                                        |
| Title = primeiro H1 ou basename; links normalizados para `.md`                                 | ✅           | `indexer.ts`                                                  |
| **Reindex completo** em `setRoot` + **incremental** nos eventos do chokidar                    | ✅           | `vault/manager.ts`, `indexer.ts`                              |
| **Busca por conteúdo** (FTS5 + BM25) — instantânea, sem custo de LLM                           | ✅           | `db.ts` (`search`), `ipc/search_handlers.ts`, `app_shell.tsx` |
| **Backlinks** via tabela `links`                                                               | ✅           | `db.ts` (`getBacklinks`), `search_handlers.ts`                |
| **Tools IA** `search` e `get_backlinks` (auto-exec, read-only)                                 | ✅           | `ai/tools.ts`, `orchestrator.ts`                              |
| DB abre no `app.whenReady` e fecha no `before-quit`                                            | ✅           | `src/index.ts`                                                |
| IPC type-safe: `vault:search`, `vault:backlinks`                                               | ✅           | `search_handlers.ts`, `preload.ts`                            |

### Extra — Persistência de Conversas do Atlas — ✅ Concluída

| Área                                                                                                                                                                                                                           | Implementado | Arquivos                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ----------------------------------------------------- |
| **Schema SQLite v2** — `chat_sessions`, `chat_messages`, `chat_messages_fts` (FTS5 com `message_id UNINDEXED`)                                                                                                                 | ✅           | `src/vault/db.ts` (migration `user_version=2`)        |
| **Métodos DB** — `createSession`, `updateSessionTitle`, `touchSession`, `deleteSession`, `listSessions`, `getSession`, `upsertMessage`, `deleteMessage`, `listMessages`, `searchMessages`                                      | ✅           | `src/vault/db.ts`                                     |
| Sync FTS standalone (delete-then-insert por `message_id`)                                                                                                                                                                      | ✅           | `src/vault/db.ts`                                     |
| **IPC handlers** `chat:create-session`, `list-sessions`, `load-session`, `delete-session`, `rename-session`, `save-message`, `search-messages`                                                                                 | ✅           | `src/ipc/chat_handlers.ts` (novo), `src/ipc/index.ts` |
| **Preload** — namespace `chat:` no `electronAPI`                                                                                                                                                                               | ✅           | `src/preload.ts`                                      |
| **chat_store** — `activeSession`, `sessions`, auto-cria sessão no 1º send, persiste user msg + assistant no `done` + assistant com toolResults, `refreshSessions`, `newConversation`, `loadConversation`, `deleteConversation` | ✅           | `src/stores/chat_store.ts`                            |
| **UI dropdown de sessões** no header do ChatPanel (fora-click, tempo relativo, "+ nova")                                                                                                                                       | ✅           | `src/components/chat/chat_panel.tsx`                  |
| **Compactação preserva sessão original** (renomeia p/ "...(compactada)") e cria nova com o summary                                                                                                                             | ✅           | `chat_store.ts`                                       |
| **Busca da sidebar mescla páginas + conversas** (FTS5 paralelo em `chat_messages_fts`)                                                                                                                                         | ✅           | `src/components/app_shell.tsx`                        |
| IPC type-safe: `chat:*`                                                                                                                                                                                                        | ✅           | `chat_handlers.ts`, `preload.ts`                      |

> **Modelo híbrido**: o schema suporta sessões globais (page_path NULL) ou vinculadas a uma página. A UI atual cria apenas sessões globais — a vinculação por página fica para a Fase 3 (precisa de UX: toggle, sempre, ou por ação explícita).

---

## O que falta

### Fase 3 — Rico

- [x] Wiki-links **clicáveis** (hoje só estão estilizados, não abrem a página alvo).
- [x] **Backlinks** (painel mostrando páginas que apontam para a atual).
- [x] **Grafo visual** estilo Obsidian (a confirmar com usuário — arquitetura lista como ponto aberto).
- [x] **Tags** como índice navegável (depende do SQLite da Fase 2). ✅ `src/components/sidebar/tags_panel.tsx`, `activity_bar.tsx`, `search_handlers.ts`
- [ ] **Busca full-text** (FTS5) — painel de busca. _(busca via sidebar e tool IA já disponíveis; falta um painel dedicado com snippets/preview mais rico.)_
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
- **better-sqlite3** (índice do vault: FTS5, links, tags) · DB em `userData/atlas.db`

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

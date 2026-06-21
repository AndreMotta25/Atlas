# Atlas — Resumo

## O que é?

Editor de Markdown desktop construído com **Electron + React + TypeScript**, integrado com um **assistente IA** (DeepSeek) que age como "memória ativa" do vault de notas. Os arquivos são pastas locais de arquivos `.md` — não um banco proprietário.

---

## Funcionalidades principais

### Gerenciamento de Notas

- **Vault local** de arquivos Markdown (qualquer pasta do sistema)
- **Editor CodeMirror 6** com formatação markdown, comentários, realce de texto
- **Live preview** do markdown
- **Pesquisa full-text** com FTS5 (SQLite) — incluso busca por conteúdo com suporte a português acentuado
- **Árvore de arquivos** com watcher (chokidar) para mudanças em tempo real
- **Wiki-links** (`[[]]`) entre páginas com backlinks rastreados

### Assistente IA (Atlas)

- Chat integrado com **DeepSeek** que **interage com o vault**:

  - `search()` — busca full-text no conteúdo das notas
  - `read_page()` — lê páginas específicas
  - `list_pages()` — lista páginas por nome
  - `get_backlinks()` — mostra páginas que linkam para outra
  - `create_page()` — cria páginas (com confirmação)
  - `edit_page()` — edita páginas (replace, append, replace_section — com confirmação)
  - `web_search()` / `web_extract()` — pesquisa na web via Tavily

- **Botões de ação** no chat (confirmar edições, escolher opções) — sem digitar
- **Compactação de conversa** para economizar tokens
- **Indicador animado** de "pensando" no header

### UI/UX

- Painéis redimensionáveis (sidebar, chat, editor)
- Chat pode ser minimizado para **bolha flutuante**
- Vault collapse/expand
- **Tema dark/light/system** com sincronização `nativeTheme`
- **Google Fonts** integrado para escolha de fonte
- Comentários em posições específicas do texto
- Context menu inline ao selecionar texto

---

## Diferenças de Notion

| Aspecto | Notion | Atlas |
|---|---|---|
| **Armazenamento** | Banco proprietário na nuvem | Arquivos `.md` locais — você controla |
| **IA** | Assistente genérico | IA que **age dentro do vault** (lê, busca, edita, cria notas) |
| **Preço** | Assinatura | Gratuito (só custo da API DeepSeek/Tavily) |
| **Offline** | Limitado | 100% offline (só web_search precisa de internet) |
| **Database** | Blocos/relacional | SQLite + arquivos de texto puro |

## Diferenças de Obsidian

| Aspecto | Obsidian | Atlas |
|---|---|---|
| **IA** | Plugins pagos externos | **IA integrada nativa** que entende o vault e executa ações |
| **Pesquisa web** | Não tem | Sim, via Tavily |
| **Chat IA** | Não tem nativo | Chat embutido que usa o vault como contexto |
| **Organização** | Vault Obsidian | Vault de arquivos `.md` padrão (funciona com qualquer editor) |
| **Edição confirmada** | Plugins fazem | IA mostra diff + botão "Sim/Não" antes de alterar |
| **Público** | Knowledge worker manual | Knowledge worker que quer **delegar à IA** a navegação e edição |

---

**Em resumo:** o Atlas é um **Obsidian com IA nativa** que não só responde perguntas, mas **age no vault** — pesquisa, lê, cria e edita páginas por você, com fluxo de confirmação visual. É um "segundo cérebro com quem você conversa".

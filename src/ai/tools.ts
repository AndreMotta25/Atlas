import { tool } from 'ai';
import { z } from 'zod';
import { VaultManager } from '../vault/manager';
import { DatabaseService } from '../vault/db';
import { SecureStore } from '../vault/secure_store';
import { tavilySearch, tavilyExtract, TavilyError } from './tavily_client';
import type { ToolSet } from 'ai';

/**
 * Read-only tools (WITH execute). The AI SDK runs them automatically in multi-step
 * and feeds the result back to the model — no user confirmation needed.
 */
const readPageTool = tool({
  description:
    'Lê o conteúdo de uma página Markdown do vault. Use caminho relativo (ex: "notas/gatos.md").',
  inputSchema: z.object({
    path: z.string().describe('Caminho relativo da página .md no vault.'),
  }),
  execute: async ({ path }) => {
    try {
      const result = await VaultManager.readPage(path);
      return {
        success: true,
        path: result.path,
        content: result.content,
        mtime: result.mtime,
      };
    } catch (err) {
      return {
        success: false,
        path,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

const listPagesTool = tool({
  description:
    'Lista todas as páginas .md do vault. Opcionalmente filtra por substring no caminho.',
  inputSchema: z.object({
    filter: z
      .string()
      .optional()
      .describe('Substring para filtrar caminhos (case-insensitive).'),
  }),
  execute: async ({ filter }) => {
    try {
      const tree = await VaultManager.readTree();
      const paths: string[] = [];
      const walk = (node: typeof tree): void => {
        if (!node.isDir) {
          paths.push(node.path);
        }
        node.children?.forEach(walk);
      };
      walk(tree);
      const lower = filter?.toLowerCase();
      const filtered = lower
        ? paths.filter((p) => p.toLowerCase().includes(lower))
        : paths;
      return {
        success: true,
        count: filtered.length,
        paths: filtered,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

/**
 * Write tools (NO execute). The SDK emits a `tool-call` event but does not run
 * anything — we intercept it in the orchestrator, surface as a pending card in
 * the UI, and only execute after the user confirms.
 */
const createPageTool = tool({
  description:
    'Cria uma nova página Markdown no vault. REQUER CONFIRMAÇÃO DO USUÁRIO. ' +
    'Use caminho relativo (ex: "notas/gatos.md"). Falha se a página já existir.',
  inputSchema: z.object({
    path: z.string().describe('Caminho relativo da nova página.'),
    content: z.string().describe('Conteúdo Markdown completo da página.'),
  }),
});

const editPageTool = tool({
  description:
    'Edita uma página existente. REQUER CONFIRMAÇÃO DO USUÁRIO. ' +
    'mode "replace": substitui todo o conteúdo. ' +
    'mode "append": adiciona ao final da página. ' +
    'mode "replace_section": substitui a seção identificada por `section` ' +
    '(texto do heading SEM o prefixo #).',
  inputSchema: z.object({
    path: z.string().describe('Caminho relativo da página a editar.'),
    mode: z.enum(['replace', 'append', 'replace_section']),
    content: z
      .string()
      .describe(
        'Novo conteúdo. Para replace_section é o corpo novo da seção (sem o heading).',
      ),
    section: z
      .string()
      .optional()
      .describe(
        'Obrigatório quando mode = "replace_section". Texto do heading sem o prefixo #.',
      ),
  }),
});

const searchTool = tool({
  description:
    'Busca full-text no conteúdo de todas as páginas do vault (FTS5). ' +
    'Use para encontrar páginas que mencionam um termo, mesmo que ele não esteja ' +
    'no nome do arquivo. Retorna path, título e um trecho do conteúdo.',
  inputSchema: z.object({
    query: z.string().describe('Termo ou frase de busca.'),
    limit: z
      .number()
      .int()
      .positive()
      .max(50)
      .optional()
      .describe('Número máximo de resultados (padrão 20).'),
  }),
  execute: async ({ query, limit }) => {
    try {
      const results = DatabaseService.search(query, limit ?? 20);
      return {
        success: true,
        count: results.length,
        query,
        results,
      };
    } catch (err) {
      return {
        success: false,
        query,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

const getBacklinksTool = tool({
  description:
    'Lista as páginas do vault que apontam (via [[wiki-link]]) para a página informada. ' +
    'Use quando o usuário perguntar "o que referencia X?" ou "quem aponta para Y?".',
  inputSchema: z.object({
    path: z
      .string()
      .describe('Caminho relativo da página alvo (ex: "notas/gatos.md").'),
  }),
  execute: async ({ path }) => {
    try {
      const backlinks = DatabaseService.getBacklinks(path);
      return {
        success: true,
        path,
        count: backlinks.length,
        backlinks,
      };
    } catch (err) {
      return {
        success: false,
        path,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

/**
 * Resolve a chave Tavily em runtime do SecureStore. Retorna null quando não
 * configurada — a tool decide como relatar o erro ao modelo.
 */
const getTavilyKey = (): string | null => SecureStore.getApiKey('tavily');

const webSearchTool = tool({
  description:
    'Pesquisa na web via Tavily. Use quando a pergunta exigir conhecimento ' +
    'externo (eventos recentes, tópicos além do vault, dados atuais). ' +
    'Retorna resultados ranqueados com título, URL e trecho, e opcionalmente ' +
    'uma resposta sintetizada. Sempre prefira search() local antes desta.',
  inputSchema: z.object({
    query: z.string().describe('Termo ou frase de busca em português ou inglês.'),
    maxResults: z
      .number()
      .int()
      .positive()
      .max(10)
      .optional()
      .describe('Número máximo de resultados (padrão 8).'),
  }),
  execute: async ({ query, maxResults }) => {
    const apiKey = getTavilyKey();
    if (!apiKey) {
      return {
        success: false,
        query,
        error: 'Tavily API key não configurada. Peça ao usuário para adicioná-la em Configurações.',
      };
    }
    try {
      const resp = await tavilySearch(apiKey, {
        query,
        maxResults: maxResults ?? 8,
        searchDepth: 'advanced',
        includeAnswer: true,
      });
      return {
        success: true,
        query,
        count: resp.results.length,
        answer: resp.answer,
        results: resp.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content.slice(0, 600),
          score: r.score,
        })),
      };
    } catch (err) {
      const msg =
        err instanceof TavilyError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      return { success: false, query, error: msg };
    }
  },
});

const webExtractTool = tool({
  description:
    'Extrai o conteúdo limpo de até 5 URLs específicas (markdown/plain text). ' +
    'Use quando os snippets do web_search não forem suficientes para uma fonte ' +
    'relevante. Não use em páginas que já retornaram conteúdo suficiente.',
  inputSchema: z.object({
    urls: z
      .array(z.string().url())
      .min(1)
      .max(5)
      .describe('Lista de URLs HTTP(S) para extrair conteúdo completo.'),
  }),
  execute: async ({ urls }) => {
    const apiKey = getTavilyKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'Tavily API key não configurada. Peça ao usuário para adicioná-la em Configurações.',
      };
    }
    try {
      const resp = await tavilyExtract(apiKey, { urls });
      return {
        success: true,
        count: resp.results.length,
        results: resp.results.map((r) => ({
          url: r.url,
          content: r.rawContent.slice(0, 8000),
        })),
        failed: resp.failed ?? [],
      };
    } catch (err) {
      const msg =
        err instanceof TavilyError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      return { success: false, error: msg };
    }
  },
});

export const TOOLS: ToolSet = {
  read_page: readPageTool,
  list_pages: listPagesTool,
  create_page: createPageTool,
  edit_page: editPageTool,
  search: searchTool,
  get_backlinks: getBacklinksTool,
  web_search: webSearchTool,
  web_extract: webExtractTool,
};

export const WRITE_TOOLS = new Set<string>(['create_page', 'edit_page']);

export const isWriteTool = (name: string): boolean => WRITE_TOOLS.has(name);

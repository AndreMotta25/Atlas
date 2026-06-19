import { tool } from 'ai';
import { z } from 'zod';
import { VaultManager } from '../vault/manager';
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

export const TOOLS: ToolSet = {
  read_page: readPageTool,
  list_pages: listPagesTool,
  create_page: createPageTool,
  edit_page: editPageTool,
};

export const WRITE_TOOLS = new Set<string>(['create_page', 'edit_page']);

export const isWriteTool = (name: string): boolean => WRITE_TOOLS.has(name);

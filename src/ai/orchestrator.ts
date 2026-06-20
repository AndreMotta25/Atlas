import { streamText } from 'ai';
import type { AssistantContent, ModelMessage, ToolCallPart, ToolResultPart } from 'ai';
import { ConfigStore } from '../vault/config_store';
import { SecureStore } from '../vault/secure_store';
import { createDeepSeek } from './providers/deepseek';
import { TOOLS } from './tools';
import type {
  ChatMessage,
  ChatRequestOptions,
  ChatStreamChunk,
  PendingToolCall,
  ToolResultPayload,
} from '../types';

export const DEFAULT_SYSTEM_PROMPT = [
  'Você é o Atlas — a memória ativa de um vault de notas Markdown.',
  'Seu trabalho não é só responder perguntas: é conhecer o vault, conectar',
  'informações e ajudar o usuário a pensar. Você age como um segundo cérebro,',
  'não como um chatbot que também lê arquivos.',
  '',
  '══ FERRAMENTAS ══',
  '· search({ query, limit? }) — busca full-text (FTS5) no CONTEÚDO das páginas. Use primeiro.',
  '· list_pages({ filter? }) — lista páginas por NOME (filtro opcional).',
  '· read_page({ path }) — lê uma página .md específica.',
  '· get_backlinks({ path }) — lista páginas que linkam para a página informada.',
  '· create_page({ path, content }) — cria página (REQUER CONFIRMAÇÃO).',
  '· edit_page({ path, mode, content, section? }) — edita página (REQUER CONFIRMAÇÃO).',
  '  modos: "replace" | "append" | "replace_section" (section = heading sem #).',
  '· web_search({ query, maxResults? }) — pesquisa na web via Tavily. Exige API key configurada.',
  '· web_extract({ urls }) — extrai conteúdo completo de até 5 URLs HTTP(S).',
  '',
  '══ USO DISCIPLINADO DE FERRAMENTAS ══',
  '1. search() SEMPRE antes de read_page(). Só chame read_page() quando souber',
  '   exatamente qual página abrir — nunca "para explorar".',
  '2. Nunca abra com read_page() uma página cujo conteúdo search()/list_pages()',
  '   já devolveu no mesmo turno.',
  '3. Limite auto-imposto: no máximo 3 read_page() por turno. Se precisar de mais,',
  '   peça permissão ao usuário.',
  '4. get_backlinks() só quando a pergunta for sobre conexões/relações entre páginas.',
  '5. PESQUISA WEB: prefira SEMPRE o vault (search/read_page) antes de web_search().',
  '   Só use web_search() quando a resposta provavelmente NÃO está no vault:',
  '   eventos recentes, dados externos, tópicos que você não domina.',
  '6. Após web_search(), se 1-3 fontes forem claramente centrais, chame',
  '   web_extract() nelas para conteúdo completo antes de gerar o documento.',
  '7. Em documentos baseados em pesquisa web, cite fontes como [1], [2] ao longo',
  '   do texto e liste-as no final com título + URL.',
  '',
  '══ RACIOCÍNIO VISÍVEL ══',
  'Percorra esta sequência mentalmente e mostre o passo em colchetes [ ] quando',
  'ele ajudar o usuário a acompanhar o que você está fazendo:',
  '',
  '1. O que o usuário realmente quer saber?',
  '2. Preciso buscar no vault? → search() primeiro.',
  '3. Preciso ler alguma página específica? → só depois do search().',
  '4. O contexto está completo ou vale checar backlinks?',
  '5. O que é essencial mostrar — e o que posso omitir?',
  '',
  'Exemplo:',
  '[Busquei "reunião maio" → 2 resultados → lendo o mais recente]',
  '[Página grande → extraindo só as decisões relevantes]',
  '',
  '══ HIERARQUIA DE PRIORIDADES ══',
  'Em conflito entre regras, esta ordem decide:',
  '  1. Segurança — nunca escreva sem confirmação explícita.',
  '  2. Precisão — só afirme o que está no vault; sinalize quando inferir.',
  '  3. Clareza — resposta útil vale mais que resposta bonita.',
  '  4. Concisão — menos é mais, mas não às custas da clareza.',
  '',
  '══ REGRAS ══',
  '',
  '1. PORTUGUÊS sempre. Tom direto, natural e profissional. Sem emojis.',
  '',
  '2. DESAMBIGUAÇÃO — pedidos vagos ("altera isso", "arruma ali") exigem UMA',
  '   pergunta curta com opções concretas antes de agir. Não chute.',
  '   Ex.: "Você quer que eu (a) troque o título, (b) mova para outra seção, (c) outra coisa?"',
  '',
  '3. BOTÕES DE AÇÃO — OBRIGATÓRIO. Toda vez que a próxima ação depender de uma',
  '   resposta curta do usuário (sim/não, escolher entre opções, confirmar uma',
  '   edição, prosseguir ou parar), você DEVE terminar a resposta com um bloco',
  '   `buttons` — uma etiqueta por linha, máximo 6. NUNCA faça uma pergunta',
  '   de sim/não em prosa sem o bloco buttons.',
  '',
  '   Exemplo (edição pedida pelo usuário):',
  '',
  '   ```',
  '   Vou substituir o conteúdo atual de `teste2.md` pelo novo texto.',
  '',
  '   ```buttons',
  '   Sim, substituir',
  '   Não, cancelar',
  '   ```',
  '   ```',
  '',
  '   Regras do bloco buttons:',
  '   · Toda pergunta fechada (sim/não, escolher A/B/C, confirmar) USA o bloco.',
  '   · Etiquetas curtas (idealmente ≤ 3 palavras) — viram botões clicáveis.',
  '   · Nunca use para perguntas abertas ("o que você acha?").',
  '   · Um único bloco por mensagem, sempre na ÚLTIMA linha.',
  '   · Depois do bloco NÃO escreva mais nada.',
  '',
  '4. LEITURA — não despeje conteúdo no chat:',
  '   · Quando ler uma página, responda só `Página lida — <path>` no chat e traga',
  '     apenas o trecho estritamente necessário para a resposta.',
  '   · Nunca devolva o conteúdo bruto de uma página.',
  '   · Páginas grandes → resuma em 2-3 bullets o que importa.',
  '',
  '5. ESCRITA — confirmação obrigatória via bloco buttons:',
  '   · Mostre path + conteúdo completo antes de executar.',
  '   · Peça confirmação SEMPRE com um bloco buttons ("Sim, aplicar" / "Não, cancelar").',
  '   · Nunca peça confirmação em prosa — o usuário clica no botão.',
  '   · Aguarde o resultado. Não assuma que foi aplicado.',
  '',
  '6. MARKDOWN BEM FORMATADO — toda resposta não-trivial é estruturada:',
  '   · Headings (#, ##) para organizar seções de respostas longas.',
  '   · Listas (-) para enumerações e passos.',
  '   · `código` para paths, nomes de arquivo, comandos, valores curtos.',
  '   · ```blocos``` (com linguagem) para código multilinha.',
  '   · **negrito** só para destaque pontual, nunca em frases inteiras.',
  '   · Tabelas só para comparações reais com mais de 2 itens.',
  '   · Resposta curta (≤3 itens): direto, sem heading, sem markdown decorativo.',
  '   · Nunca mais de 4 linhas seguidas sem quebra visual.',
  '   · Sem ---, blockquotes vazias ou floreios.',
  '',
  '7. CONCISÃO:',
  '   · Não explique o que fez — mostre o resultado.',
  '   · Não repita informação já visível nos cards de ferramentas.',
  '   · Se cabe em 3 bullets, não vire 2 parágrafos.',
  '',
  '8. ERROS E AUSÊNCIAS:',
  '   · Informe diretamente quando algo não existir ou falhar.',
  '   · Sugira alternativas: outro termo de busca, criar a página, corrigir o path.',
  '   · Nunca ignore um erro silenciosamente.',
  '',
  '9. CAMINHOS relativos à raiz do vault: "notas/receitas.md", "projetos/ideia.md".',
  '   · Paths de novas páginas DEVEM terminar em .md.',
  '',
  '══ COMPACTAÇÃO ══',
  'Quando o usuário pedir "compactar a conversa", produza um resumo estruturado',
  'em markdown com as seções fixas abaixo — sem inventar paths e sinalizando',
  'qualquer incerteza:',
  '  ## Contexto',
  '  ## Páginas mencionadas',
  '  ## Decisões e alterações',
  '  ## Ações pendentes',
  'Se uma seção não se aplicar, escreva `(nenhuma)` nela.',
  '',
  '══ EXEMPLO COMPLETO ══',
  'Usuário: "O que você sabe sobre o projeto Atlas?"',
  '',
  '[Vou buscar antes de assumir]',
  '[search({ query: "atlas" }) → 3 resultados: projetos/atlas.md, notas/reuniao-2026.md, tarefas.md]',
  '[Lendo projetos/atlas.md → extraindo stack e status]',
  '',
  '## O que existe no vault',
  '· `projetos/atlas.md` — visão geral e stack (Electron + React + Tailwind)',
  '· `notas/reuniao-2026.md` — decisões da última reunião',
  '· `tarefas.md` — 12 pendentes, 5 concluídas',
  '',
  '## Ponto de atenção',
  'A reunião priorizou o editor. As tarefas relacionadas estão no topo de `tarefas.md`.',
  '',
  'Quer que eu crie uma página consolidando essas informações?',
].join('\n');

const WRITE_TOOL_NAMES = new Set(['create_page', 'edit_page']);
const isWriteToolName = (name: string): boolean => WRITE_TOOL_NAMES.has(name);

type ChunkSink = (chunk: ChatStreamChunk) => void;
type ToolPendingSink = (pending: PendingToolCall) => void;
type ToolResultSink = (result: ToolResultPayload) => void;

export interface OrchestratorSinks {
  chunk: ChunkSink;
  /** Called for each write tool-call needing confirmation (stream pauses afterwards). */
  toolPending?: ToolPendingSink;
  /** Called for each auto-executed read tool result. */
  toolResult?: ToolResultSink;
}

/** What the orchestrator captured during a streaming run. */
export interface StreamResult {
  /** Accumulated assistant text for this turn (so the caller can persist it). */
  assistantText: string;
  /** Pending write tool calls emitted this turn (empty for normal turns). */
  pendingToolCalls: PendingToolCall[];
}

class AIOrchestratorClass {
  /**
   * Run a streaming turn. Stops the loop when a write tool-call is emitted (pending
   * confirmation). Returns the captured assistant text and pending tool calls.
   */
  async runTurn(
    opts: ChatRequestOptions,
    requestId: string,
    sinks: OrchestratorSinks,
    abortSignal?: AbortSignal,
  ): Promise<StreamResult> {
    const settings = ConfigStore.load();
    const apiKey = SecureStore.getApiKey(settings.activeProvider);

    if (!apiKey) {
      sinks.chunk({
        requestId,
        delta: '',
        done: false,
        error: `Nenhuma API key configurada para o provider "${settings.activeProvider}". Defina nas configurações.`,
      });
      sinks.chunk({ requestId, delta: '', done: true });
      return { assistantText: '', pendingToolCalls: [] };
    }

    const modelId = opts.model ?? settings.defaultModel;

    if (settings.activeProvider !== 'deepseek') {
      sinks.chunk({
        requestId,
        delta: '',
        done: false,
        error: `Provider "${settings.activeProvider}" ainda não implementado.`,
      });
      sinks.chunk({ requestId, delta: '', done: true });
      return { assistantText: '', pendingToolCalls: [] };
    }

    const chat = createDeepSeek(apiKey);
    const model = chat(modelId);

    const systemPrompt = settings.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;

    const result: StreamResult = { assistantText: '', pendingToolCalls: [] };

    try {
      const stream = streamText({
        model,
        system: systemPrompt,
        messages: this.toModelMessages(opts.messages),
        tools: TOOLS,
        abortSignal,
        stopWhen: ({ steps }) => {
          const lastStep = steps[steps.length - 1];
          if (!lastStep) return true;
          // Continue while the model is calling tools that we can auto-execute.
          // Stop when the model stops calling tools OR calls a write tool
          // (no execute → needs user confirmation).
          if (lastStep.finishReason !== 'tool-calls') return true;
          return lastStep.toolCalls.some((tc) => isWriteToolName(tc.toolName));
        },
      });

      for await (const part of stream.fullStream) {
        switch (part.type) {
          case 'text-delta': {
            result.assistantText += part.text;
            sinks.chunk({ requestId, delta: part.text, done: false });
            break;
          }
          case 'tool-call': {
            if (isWriteToolName(part.toolName)) {
              const pending: PendingToolCall = {
                requestId,
                toolCallId: part.toolCallId,
                toolName: part.toolName as 'create_page' | 'edit_page',
                args: (part as { input?: unknown }).input
                  ? ((part as { input: unknown }).input as Record<string, unknown>)
                  : {},
                status: 'pending',
              };
              result.pendingToolCalls.push(pending);
              sinks.toolPending?.(pending);
            }
            break;
          }
          case 'tool-result': {
            const out = (part as { output?: unknown }).output as
              | Record<string, unknown>
              | undefined;
            sinks.toolResult?.({
              toolCallId: part.toolCallId,
              toolName: part.toolName as PendingToolCall['toolName'] | 'read_page' | 'list_pages' | 'search' | 'get_backlinks' | 'web_search' | 'web_extract',
              success: Boolean(out?.success),
              path: typeof out?.path === 'string' ? out.path : undefined,
              content: this.summarizeToolOutput(part.toolName, out),
              count: typeof out?.count === 'number' ? out.count : undefined,
              error: typeof out?.error === 'string' ? out.error : undefined,
            });
            break;
          }
          case 'error': {
            const err = (part as { error: unknown }).error;
            const msg = err instanceof Error ? err.message : String(err);
            sinks.chunk({ requestId, delta: '', done: false, error: msg });
            break;
          }
          default:
            break;
        }
      }

      // If we have pending write tool calls, do NOT emit done:true — the renderer
      // keeps `streaming: true` so the UI stays engaged while waiting for confirm.
      if (result.pendingToolCalls.length === 0) {
        sinks.chunk({ requestId, delta: '', done: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sinks.chunk({ requestId, delta: '', done: false, error: msg });
      sinks.chunk({ requestId, delta: '', done: true });
    }

    return result;
  }

  /**
   * Render a read-tool's structured output as a short text blob for the chat card.
   * The model itself receives the full JSON via the SDK's tool-result message;
   * this is purely for the renderer's ToolResultCard preview.
   */
  private summarizeToolOutput(
    toolName: string,
    out: Record<string, unknown> | undefined,
  ): string | undefined {
    if (!out) return undefined;
    if (typeof out.content === 'string') return out.content;
    if (Array.isArray(out.paths)) return (out.paths as string[]).join('\n');
    if (toolName === 'search' && Array.isArray(out.results)) {
      const items = out.results as Array<{
        path: string;
        title?: string;
        snippet?: string;
      }>;
      return items
        .map((r) => `· ${r.title ? `${r.title} (${r.path})` : r.path}${r.snippet ? `\n  ${r.snippet.slice(0, 120)}` : ''}`)
        .join('\n');
    }
    if (toolName === 'get_backlinks' && Array.isArray(out.backlinks)) {
      const items = out.backlinks as Array<{
        fromPath: string;
        fromTitle?: string;
        anchor?: string | null;
      }>;
      if (items.length === 0) return '(nenhum backlink)';
      return items
        .map((b) => `· ${b.fromTitle ? `${b.fromTitle} (${b.fromPath})` : b.fromPath}${b.anchor ? ` ← "${b.anchor}"` : ''}`)
        .join('\n');
    }
    if (toolName === 'web_search') {
      const query = typeof out.query === 'string' ? out.query : '';
      const answer = typeof out.answer === 'string' && out.answer.trim() ? out.answer.trim() : null;
      const results = Array.isArray(out.results)
        ? (out.results as Array<{ title?: string; url?: string }>)
        : [];
      if (!results.length) return answer ?? '(sem resultados)';
      const lines = results.slice(0, 5).map((r) => {
        const host = (() => {
          try {
            return r.url ? new URL(r.url).host : '';
          } catch {
            return '';
          }
        })();
        return `· ${r.title ?? host ?? r.url}${host ? ` — ${host}` : ''}`;
      });
      const head = query ? `Busca: "${query.slice(0, 80)}" → ${results.length} fontes` : `${results.length} fontes`;
      return [head, ...(answer ? [`Resposta: ${answer.slice(0, 200)}`] : []), ...lines].join('\n');
    }
    if (toolName === 'web_extract') {
      const results = Array.isArray(out.results)
        ? (out.results as Array<{ url?: string; content?: string }>)
        : [];
      if (!results.length) return '(nenhuma página extraída)';
      return results
        .map((r) => {
          const host = (() => {
            try {
              return r.url ? new URL(r.url).host : r.url ?? '';
            } catch {
              return r.url ?? '';
            }
          })();
          const preview = r.content ? r.content.slice(0, 100).replace(/\s+/g, ' ') : '';
          return `· ${host}${preview ? ` — ${preview}…` : ''}`;
        })
        .join('\n');
    }
    return undefined;
  }

  /**
   * Convert our ChatMessage[] into ModelMessage[] for streamText. Past assistant
   * turns with toolCalls/toolResults are reconstructed as proper tool-call and
   * tool-result parts so the model retains full context across resume.
   *
   * Tool results MUST be emitted as separate messages with role "tool",
   * otherwise the SDK's convertToLanguageModelPrompt throws
   * MissingToolResultsError (it only resolves tool calls via "tool"-role
   * messages, not from parts inside the assistant message).
   */
  private toModelMessages(messages: ChatMessage[]): ModelMessage[] {
    const out: ModelMessage[] = [];
    for (const m of messages) {
      if (m.role === 'system') {
        out.push({ role: 'system', content: m.content });
        continue;
      }
      if (m.role === 'user') {
        out.push({ role: 'user', content: m.content });
        continue;
      }
      // assistant — may carry text + tool calls.
      // Tool results go as *separate* "tool" role messages (see contract above).
      const parts: Array<ToolCallPart | { type: 'text'; text: string }> = [];
      if (m.content) parts.push({ type: 'text', text: m.content });
      m.toolCalls?.forEach((tc) => {
        parts.push({
          type: 'tool-call',
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          input: tc.args,
        });
      });
      // Read tools (list_pages, read_page) auto-execute during multi-step and
      // produce tool-result events, but their tool-call events are NOT sent to
      // the renderer (only write tools get toolPending).  If we emit tool-role
      // messages for those results without a preceding assistant tool-call, the
      // DeepSeek API rejects the request.  Create synthetic tool-call parts for
      // orphan results so the message sequence is valid.
      m.toolResults?.forEach((tr) => {
        if (!m.toolCalls?.some((tc) => tc.toolCallId === tr.toolCallId)) {
          parts.push({
            type: 'tool-call',
            toolCallId: tr.toolCallId,
            toolName: tr.toolName,
            input: {},
          });
        }
      });
      const content: AssistantContent = parts.length ? parts : '';
      out.push({ role: 'assistant', content });

      // Emit each tool result as its own "tool" role message.
      m.toolResults?.forEach((tr) => {
        out.push({
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: tr.toolCallId,
              toolName: tr.toolName,
              output: {
                type: 'json',
                value: {
                  success: tr.success,
                  path: tr.path,
                  content: tr.content,
                  count: tr.count,
                  error: tr.error,
                  undone: tr.undone,
                },
              },
            },
          ],
        });
      });
    }
    return out;
  }
}

export const AIOrchestrator = new AIOrchestratorClass();

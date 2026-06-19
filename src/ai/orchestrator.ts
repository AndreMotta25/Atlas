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

const SYSTEM_PROMPT = [
  'Você é o Atlas, assistente de um vault de notas Markdown.',
  '',
  'Ferramentas disponíveis:',
  '- read_page({ path }) — lê uma página .md do vault',
  '- list_pages({ filter? }) — lista páginas, com filtro opcional por substring',
  '- search({ query, limit? }) — busca full-text no CONTEÚDO de todas as páginas',
  '  (FTS5). Use quando o usuário procurar um termo que pode não estar no nome do arquivo.',
  '- get_backlinks({ path }) — lista páginas que apontam para a página informada',
  '- create_page({ path, content }) — cria uma nova página (REQUER CONFIRMAÇÃO)',
  '- edit_page({ path, mode, content, section? }) — edita página (REQUER CONFIRMAÇÃO)',
  '  · mode "replace": substitui todo o conteúdo',
  '  · mode "append": adiciona ao final da página',
  '  · mode "replace_section": substitui a seção identificada por `section`',
  '    (texto do heading SEM o prefixo #)',
  '',
  'REGRAS:',
  '1. Para responder sobre o vault, use read_page, list_pages, search e get_backlinks livremente.',
  '2. Para criar/editar, PROVENHA a operação via tool — o usuário confirmará.',
  '3. NUNCA assuma que a escrita foi aplicada. Aguarde o resultado da tool.',
  '4. Responda sempre em português. Seja conciso.',
  '5. Caminhos são relativos ao vault (ex: notas/gatos.md).',
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

    const result: StreamResult = { assistantText: '', pendingToolCalls: [] };

    try {
      const stream = streamText({
        model,
        system: SYSTEM_PROMPT,
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
              toolName: part.toolName as PendingToolCall['toolName'] | 'read_page' | 'list_pages' | 'search' | 'get_backlinks',
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

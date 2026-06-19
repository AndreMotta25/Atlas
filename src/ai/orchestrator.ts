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
  '- create_page({ path, content }) — cria uma nova página (REQUER CONFIRMAÇÃO)',
  '- edit_page({ path, mode, content, section? }) — edita página (REQUER CONFIRMAÇÃO)',
  '  · mode "replace": substitui todo o conteúdo',
  '  · mode "append": adiciona ao final da página',
  '  · mode "replace_section": substitui a seção identificada por `section`',
  '    (texto do heading SEM o prefixo #)',
  '',
  'REGRAS:',
  '1. Para responder sobre o vault, use read_page e list_pages livremente.',
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
        // Stop on the first write tool call so we can ask the user for confirmation
        // before executing it. Read tools have execute() and resolve automatically.
        stopWhen: (result) =>
          result.steps.some((step) =>
            step.toolCalls.some((tc) => isWriteToolName(tc.toolName)),
          ),
        abortSignal,
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
              toolName: part.toolName as PendingToolCall['toolName'] | 'read_page' | 'list_pages',
              success: Boolean(out?.success),
              path: typeof out?.path === 'string' ? out.path : undefined,
              content:
                typeof out?.content === 'string'
                  ? out.content
                  : Array.isArray(out?.paths)
                    ? (out.paths as string[]).join('\n')
                    : undefined,
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
   * Convert our ChatMessage[] into ModelMessage[] for streamText. Past assistant
   * turns with toolCalls/toolResults are reconstructed as proper tool-call and
   * tool-result parts so the model retains full context across resume.
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
      // assistant — may carry text + tool calls + tool results
      const parts: Array<ToolCallPart | ToolResultPart | { type: 'text'; text: string }> = [];
      if (m.content) parts.push({ type: 'text', text: m.content });
      m.toolCalls?.forEach((tc) => {
        parts.push({
          type: 'tool-call',
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          input: tc.args,
        });
      });
      m.toolResults?.forEach((tr) => {
        parts.push({
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
        });
      });
      const content: AssistantContent = parts.length ? parts : '';
      out.push({ role: 'assistant', content });
    }
    return out;
  }
}

export const AIOrchestrator = new AIOrchestratorClass();

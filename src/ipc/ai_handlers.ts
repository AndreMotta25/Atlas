import { ipcMain, BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'crypto';
import { generateText } from 'ai';
import { createChannel } from '../types';
import { AIOrchestrator, type OrchestratorSinks } from '../ai/orchestrator';
import { createChat, type ChatProvider } from '../ai/providers';
import { ConfigStore } from '../vault/config_store';
import { SecureStore } from '../vault/secure_store';
import { VaultManager } from '../vault/manager';
import type {
  ChatMessage,
  ChatRequestOptions,
  ChatStreamChunk,
  ConversationContext,
  PendingToolCall,
  ToolResultPayload,
} from '../types';

const activeControllers = new Map<string, AbortController>();

/**
 * In-main conversation state per active AI request. Used to resume the stream
 * after the user confirms or rejects a pending write tool call.
 */
const conversationContexts = new Map<string, ConversationContext>();

export const getConversationContext = (requestId: string): ConversationContext | undefined =>
  conversationContexts.get(requestId);

const sendToSender = (sender: IpcMainInvokeEvent['sender'], channel: string, payload: unknown) => {
  if (!sender.isDestroyed()) sender.send(channel, payload);
};

const broadcastToWindows = (channel: string, payload: unknown) => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
};

const buildSinks = (sender: IpcMainInvokeEvent['sender']): OrchestratorSinks => ({
  chunk: (chunk) => sendToSender(sender, createChannel('ai', 'token'), chunk),
  toolPending: (pending) =>
    sendToSender(sender, createChannel('ai', 'tool-pending'), pending),
  toolResult: (result) =>
    sendToSender(sender, createChannel('ai', 'tool-result'), result),
});

const runTurnAndStore = async (
  sender: IpcMainInvokeEvent['sender'],
  opts: ChatRequestOptions,
  requestId: string,
): Promise<void> => {
  const controller = new AbortController();
  activeControllers.set(requestId, controller);

  const context: ConversationContext = {
    requestId,
    messages: opts.messages,
    model: opts.model,
    pagePath: opts.pagePath ?? null,
    pending: new Map(),
  };
  conversationContexts.set(requestId, context);

  try {
    const result = await AIOrchestrator.runTurn(
      { messages: opts.messages, model: opts.model, pagePath: opts.pagePath ?? null },
      requestId,
      buildSinks(sender),
      controller.signal,
    );

    // If we captured pending write tool calls, register them so tool:confirm /
    // tool:reject can find them later. We also stash the assistant text so the
    // next resume includes it as part of the assistant turn.
    if (result.pendingToolCalls.length > 0) {
      for (const pending of result.pendingToolCalls) {
        context.pending.set(pending.toolCallId, pending);
      }
      // Replace the last message (placeholder assistant) with the captured one.
      // The renderer already has the streaming text; we just need the structure.
      context.messages = [
        ...opts.messages,
        {
          id: requestId,
          role: 'assistant',
          content: result.assistantText,
          toolCalls: result.pendingToolCalls,
        },
      ];
    } else {
      // Normal turn complete — context is no longer needed.
      conversationContexts.delete(requestId);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sendToSender(sender, createChannel('ai', 'token'), {
      requestId,
      delta: '',
      done: false,
      error: msg,
    } satisfies ChatStreamChunk);
    sendToSender(sender, createChannel('ai', 'token'), {
      requestId,
      delta: '',
      done: true,
    } satisfies ChatStreamChunk);
    conversationContexts.delete(requestId);
  } finally {
    activeControllers.delete(requestId);
  }
};

/**
 * Continue the conversation after the user confirmed or rejected a pending
 * write tool call. The tool result is appended to the message history and the
 * model is invoked again.
 */
export const resumeConversation = async (
  sender: IpcMainInvokeEvent['sender'],
  requestId: string,
  toolResult: ToolResultPayload,
  pending: PendingToolCall,
): Promise<void> => {
  const context = conversationContexts.get(requestId);
  if (!context) {
    sendToSender(sender, createChannel('ai', 'token'), {
      requestId,
      delta: '',
      done: true,
    } satisfies ChatStreamChunk);
    return;
  }

  // Attach the tool result to the assistant message we captured earlier.
  const updatedMessages: ChatMessage[] = context.messages.map((m) =>
    m.id === requestId
      ? { ...m, toolResults: [...(m.toolResults ?? []), toolResult] }
      : m,
  );
  context.messages = updatedMessages;
  context.pending.delete(pending.toolCallId);

  // Surface the result to the renderer (updates card state).
  broadcastToWindows(createChannel('ai', 'tool-result'), toolResult);

  const controller = new AbortController();
  activeControllers.set(requestId, controller);

  try {
    const result = await AIOrchestrator.runTurn(
      { messages: updatedMessages, model: context.model, pagePath: context.pagePath ?? null },
      requestId,
      buildSinks(sender),
      controller.signal,
    );

    if (result.pendingToolCalls.length > 0) {
      // Model proposed another write tool — keep waiting for confirmation.
      for (const next of result.pendingToolCalls) {
        context.pending.set(next.toolCallId, next);
      }
      // Append the new assistant text/tool calls as a fresh message
      // (the previous assistant turn is now "closed" with its tool result).
      context.messages = [
        ...updatedMessages,
        {
          id: randomUUID(),
          role: 'assistant',
          content: result.assistantText,
          toolCalls: result.pendingToolCalls,
        },
      ];
    } else {
      conversationContexts.delete(requestId);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sendToSender(sender, createChannel('ai', 'token'), {
      requestId,
      delta: '',
      done: false,
      error: msg,
    } satisfies ChatStreamChunk);
    sendToSender(sender, createChannel('ai', 'token'), {
      requestId,
      delta: '',
      done: true,
    } satisfies ChatStreamChunk);
    conversationContexts.delete(requestId);
  } finally {
    activeControllers.delete(requestId);
  }
};

export const registerAIHandlers = (): void => {
  ipcMain.handle(
    createChannel('ai', 'chat'),
    async (event, opts: ChatRequestOptions) => {
      const requestId = randomUUID();
      const sender = event.sender;

      // Fire and forget — streaming happens via sinks.
      void runTurnAndStore(sender, opts, requestId);

      return { requestId };
    },
  );

  ipcMain.handle(createChannel('ai', 'cancel'), async (_e, requestId: string) => {
    const controller = activeControllers.get(requestId);
    if (controller) {
      controller.abort();
      activeControllers.delete(requestId);
    }
    conversationContexts.delete(requestId);
    broadcastToWindows(createChannel('ai', 'token'), {
      requestId,
      delta: '',
      done: true,
    } satisfies ChatStreamChunk);
    return { success: true };
  });

  // ── AI: Compact conversation ──
  ipcMain.handle(
    createChannel('ai', 'compact'),
    async (_e, messages: ChatMessage[], pagePath?: string | null) => {
      const settings = ConfigStore.load();
      const apiKey = SecureStore.getApiKey(settings.activeProvider);
      if (!apiKey) return { success: false, error: 'Nenhuma API key configurada.' };

      let chat: ReturnType<typeof createChat>;
      try {
        chat = createChat(settings.activeProvider as ChatProvider, apiKey);
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      const model = chat(settings.defaultModel);

      // Render each message INCLUDING tool calls and tool results — these carry
      // the most valuable context (paths read, edits applied, errors). Dropping
      // them (as the previous version did) produced summaries that forgot every
      // page the conversation touched.
      const conversationText = messages
        .filter((m) => m.role !== 'system')
        .map((m) => {
          const speaker = m.role === 'user' ? 'Usuário' : 'Atlas';
          const parts: string[] = [`**${speaker}**:`];
          if (m.content.trim()) parts.push(m.content.trim());
          m.toolCalls?.forEach((tc) => {
            const arg = tc.args && typeof tc.args === 'object'
              ? Object.entries(tc.args as Record<string, unknown>)
                  .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                  .join(', ')
              : '';
            parts.push(`  [tool-call ${tc.toolName}(${arg})]`);
          });
          m.toolResults?.forEach((tr) => {
            const bits: string[] = [];
            if (tr.path) bits.push(`path=${tr.path}`);
            if (typeof tr.count === 'number') bits.push(`count=${tr.count}`);
            if (tr.success === false) bits.push('FALHOU');
            if (tr.error) bits.push(`erro=${tr.error}`);
            parts.push(`  [tool-result ${tr.toolName}${bits.length ? `: ${bits.join(', ')}` : ''}]`);
          });
          return parts.join('\n');
        })
        .join('\n\n---\n\n');

      const boundPage = typeof pagePath === 'string' && pagePath.trim() ? pagePath.trim() : null;
      const boundBlock = boundPage
        ? `\n\nEsta conversa estava vinculada à página \`${boundPage}\` — mencione isso explicitamente na seção "Contexto" se for relevante.`
        : '';

      try {
        const result = await generateText({
          model,
          system: `Você compacta conversas do Atlas (assistente de vault de notas Markdown).
Recebe o histórico entre Usuário e Atlas, incluindo chamadas de ferramenta ([tool-call ...]) e seus resultados ([tool-result ...]).

Devolva UM resumo estruturado em Markdown — SEM intro, SEM floreio — usando exatamente estas seções:

## Contexto
O que foi discutido, em 1-3 frases.

## Páginas mencionadas
Lista em bullets dos paths citados/lidos/criados/editados (use \`código\` para paths). Inclua só paths que apareceram na conversa — não invente.

## Decisões e alterações
Bullets com o que foi decidido ou alterado no vault (edições aplicadas, páginas criadas). Se nada foi alterado, escreva \`(nenhuma)\`.

## Ações pendentes
Bullets com próximos passos explícitos ou implícitos. Se não houver, escreva \`(nenhuma)\`.

Regras:
- Português, direto, sem emojis.
- Não invente paths nem conteúdos que não estejam na conversa.
- Marque incerteza com "(?)".${boundBlock}`,
          messages: [
            {
              role: 'user',
              content: `Conversa para compactar:\n\n${conversationText}`,
            },
          ],
        });

        return { success: true, summary: result.text };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  // ── AI: Search vault pages ──
  ipcMain.handle(
    createChannel('ai', 'search'),
    async (_e, query: string, pagePaths: string[]) => {
      const settings = ConfigStore.load();
      const apiKey = SecureStore.getApiKey(settings.activeProvider);
      if (!apiKey) return { success: false, error: 'Nenhuma API key configurada.' };

      let chat: ReturnType<typeof createChat>;
      try {
        chat = createChat(settings.activeProvider as ChatProvider, apiKey);
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      const model = chat(settings.defaultModel);

      try {
        const result = await generateText({
          model,
          system: `Você é um assistente de busca em vault de notas.
Você receberá uma consulta do usuário e a lista de páginas disponíveis no vault.

Sua tarefa é:
1. Analisar a consulta do usuário
2. Selecionar as páginas MAIS RELEVANTES (máximo 8) com base no nome do arquivo
3. Para cada página selecionada, explique BREVEMENTE por que é relevante

Responda APENAS com um JSON válido no seguinte formato:
{
  "results": [
    {"path": "caminho/da/pagina.md", "reason": "motivo da relevância"},
    ...
  ]
}

Se nenhuma página for relevante, retorne {"results": []}.`,
          messages: [
            {
              role: 'user',
              content: `Consulta: "${query}"\n\nPáginas disponíveis:\n${pagePaths.join('\n')}`,
            },
          ],
        });

        // Parse the JSON response
        try {
          const parsed = JSON.parse(result.text);
          return {
            success: true,
            results: Array.isArray(parsed.results) ? parsed.results : [],
          };
        } catch {
          // If the AI didn't return valid JSON, try to extract it
          const jsonMatch = result.text.match(/\{[\s\S]*"results"[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
              success: true,
              results: Array.isArray(parsed.results) ? parsed.results : [],
            };
          }
          return { success: true, results: [] };
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );
};

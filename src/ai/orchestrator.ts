import { streamText } from 'ai';
import { ConfigStore } from '../vault/config_store';
import { SecureStore } from '../vault/secure_store';
import { createDeepSeek } from './providers/deepseek';
import type { ChatRequestOptions, ChatStreamChunk } from '../types';

const SYSTEM_PROMPT =
  'Você é o Atlas, assistente de um vault de notas Markdown. ' +
  'Nesta fase ainda não tem acesso a tools — responda de forma concisa e útil em português.';

type ChunkSink = (chunk: ChatStreamChunk) => void;

class AIOrchestratorClass {
  /** Start a streaming chat. Returns a cancel function. */
  async streamChat(opts: ChatRequestOptions, requestId: string, sink: ChunkSink): Promise<void> {
    const settings = ConfigStore.load();
    const apiKey = SecureStore.getApiKey(settings.activeProvider);

    if (!apiKey) {
      sink({
        requestId,
        delta: '',
        done: false,
        error: `Nenhuma API key configurada para o provider "${settings.activeProvider}". Defina nas configurações.`,
      });
      sink({ requestId, delta: '', done: true });
      return;
    }

    const modelId = opts.model ?? settings.defaultModel;

    if (settings.activeProvider !== 'deepseek') {
      sink({
        requestId,
        delta: '',
        done: false,
        error: `Provider "${settings.activeProvider}" ainda não implementado no MVP.`,
      });
      sink({ requestId, delta: '', done: true });
      return;
    }

    const chat = createDeepSeek(apiKey);
    const model = chat(modelId);

    try {
      const result = await streamText({
        model,
        system: SYSTEM_PROMPT,
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      });

      for await (const part of result.textStream) {
        sink({ requestId, delta: part, done: false });
      }
      sink({ requestId, delta: '', done: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sink({ requestId, delta: '', done: false, error: msg });
      sink({ requestId, delta: '', done: true });
    }
  }
}

export const AIOrchestrator = new AIOrchestratorClass();

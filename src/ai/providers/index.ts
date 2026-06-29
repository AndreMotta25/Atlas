import { createDeepSeek } from './deepseek';
import { createOpenRouter } from './openrouter';
import type { AIProvider } from '../../types';

/**
 * Subset of AIProvider values that drive chat completions.
 * `tavily` lives in the same union for key-management purposes but is not
 * an LLM provider — it's a web-search backend, used only by the `web_search`
 * and `web_extract` tools.
 */
export type ChatProvider = Exclude<AIProvider, 'tavily'>;

/**
 * Chat factory used by the AI SDK — returns a callable that turns a model id
 * into a LanguageModel instance, ready for `streamText` / `generateText`.
 *
 * Only providers wired into the orchestrator appear here. Adding a new
 * provider means: (1) implement `create<Provider>` in this folder, (2) add
 * the id to `ChatProvider`, (3) extend this switch.
 */
export const createChat = (provider: ChatProvider, apiKey: string) => {
  switch (provider) {
    case 'deepseek':
      return createDeepSeek(apiKey);
    case 'openrouter':
      return createOpenRouter(apiKey);
    case 'openai':
    case 'anthropic':
    case 'ollama':
      throw new Error(`Provider "${provider}" ainda não implementado.`);
    default: {
      const exhaustive: never = provider;
      throw new Error(`Provider desconhecido: ${String(exhaustive)}`);
    }
  }
};

export { createDeepSeek } from './deepseek';
export { createOpenRouter } from './openrouter';

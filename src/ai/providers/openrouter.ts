import { createOpenAI } from '@ai-sdk/openai';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Build an OpenRouter chat model via the OpenAI-compatible adapter.
 * OpenRouter is fully OpenAI-compatible, but it expects the recommended
 * `HTTP-Referer` and `X-Title` headers — we hard-code them to the Atlas
 * identifier so requests are attributed correctly in the OpenRouter dashboard
 * and rate-limited per-app where applicable.
 *
 * Model ids follow the `<vendor>/<model>` convention exposed by OpenRouter
 * (e.g. `anthropic/claude-3.5-sonnet`, `openai/gpt-4o-mini`, `meta-llama/llama-3.1-70b-instruct`).
 * The id is passed at call site from `settings.defaultModel`.
 */
export const createOpenRouter = (apiKey: string) => {
  const openai = createOpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    headers: {
      'HTTP-Referer': 'https://atlas.local',
      'X-Title': 'Atlas',
    },
  });
  return openai.chat;
};

import { createOpenAI } from '@ai-sdk/openai';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

/**
 * Build a DeepSeek chat model via the OpenAI-compatible adapter.
 * The model id (e.g. 'deepseek-chat') is passed at call site.
 */
export const createDeepSeek = (apiKey: string) => {
  const openai = createOpenAI({ baseURL: DEEPSEEK_BASE_URL, apiKey });
  return openai.chat;
};

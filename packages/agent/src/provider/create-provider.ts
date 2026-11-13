import type { ModelProvider } from '../types.js';
import { AgentError } from '../errors.js';
import { FakeProvider } from './fake-provider.js';
import { OpenAICompatibleProvider } from './openai-provider.js';

export type ProviderKind = 'auto' | 'fake' | 'openai';

export function createProvider(options: {
  kind: ProviderKind;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): ModelProvider {
  const env = options.env ?? process.env;
  if (options.kind === 'fake') return new FakeProvider();
  if (options.kind === 'auto' && !env.OPENAI_API_KEY) return new FakeProvider();
  if (!env.OPENAI_API_KEY) {
    throw new AgentError(
      'MISSING_API_KEY',
      'OPENAI_API_KEY is required for --provider openai',
    );
  }
  return new OpenAICompatibleProvider({
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    model: env.GAMEDREAM_MODEL ?? 'gpt-4o-mini',
    fetchImpl: options.fetchImpl,
  });
}

import { AgentError } from '../errors.js';
import { FakeVisionProvider } from './fake-vision-provider.js';
import { OpenAIVisionProvider } from './openai-vision-provider.js';
import type { VisionProvider } from './types.js';

export type VisionProviderKind = 'fake' | 'openai';

export function createVisionProvider(options: {
  kind: VisionProviderKind;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): VisionProvider {
  if (options.kind === 'fake') return new FakeVisionProvider();
  const env = options.env ?? process.env;
  if (!env.OPENAI_API_KEY) {
    throw new AgentError(
      'MISSING_API_KEY',
      'OPENAI_API_KEY is required for --vision openai',
    );
  }
  return new OpenAIVisionProvider({
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    model: env.GAMEDREAM_VISION_MODEL ?? 'gpt-4o-mini',
    fetchImpl: options.fetchImpl,
  });
}

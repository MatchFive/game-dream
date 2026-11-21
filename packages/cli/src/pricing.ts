import type { ModelProvider, TokenCostRates } from '@gamedream/agent';

export interface TokenPricing {
  known: boolean;
  model: string;
  source: 'fake' | 'table' | 'env' | 'unknown';
  promptPerMTok?: number;
  completionPerMTok?: number;
  cachedPerMTok?: number;
}

const TABLE: Record<string, { prompt: number; completion: number; cached: number }> = {
  'gpt-4o-mini': { prompt: 0.15, completion: 0.6, cached: 0.075 },
  'gpt-4o': { prompt: 2.5, completion: 10, cached: 1.25 },
};

function positiveNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export function resolveTokenPricing(
  provider: ModelProvider,
  env: NodeJS.ProcessEnv = process.env,
): TokenPricing {
  const model = provider.model ?? env.GAMEDREAM_MODEL ?? 'gpt-4o-mini';
  if (provider.name === 'fake' || model === 'fake') {
    return {
      known: true,
      model,
      source: 'fake',
      promptPerMTok: 0,
      completionPerMTok: 0,
      cachedPerMTok: 0,
    };
  }
  const envPrompt = positiveNumber(env.GAMEDREAM_PRICE_PROMPT_PER_MTOK);
  const envCompletion = positiveNumber(env.GAMEDREAM_PRICE_COMPLETION_PER_MTOK);
  if (envPrompt !== undefined && envCompletion !== undefined) {
    return {
      known: true,
      model,
      source: 'env',
      promptPerMTok: envPrompt,
      completionPerMTok: envCompletion,
      cachedPerMTok: positiveNumber(env.GAMEDREAM_PRICE_CACHED_PER_MTOK) ?? envPrompt,
    };
  }
  const table = TABLE[model];
  if (!table) return { known: false, model, source: 'unknown' };
  return {
    known: true,
    model,
    source: 'table',
    promptPerMTok: table.prompt,
    completionPerMTok: table.completion,
    cachedPerMTok: table.cached,
  };
}

export function tokenCostRates(pricing: TokenPricing): TokenCostRates | undefined {
  if (!pricing.known) return undefined;
  return {
    promptPerToken: (pricing.promptPerMTok ?? 0) / 1_000_000,
    completionPerToken: (pricing.completionPerMTok ?? 0) / 1_000_000,
    cachedPerToken: (pricing.cachedPerMTok ?? pricing.promptPerMTok ?? 0) / 1_000_000,
  };
}

export function formatCost(costUsd: number | undefined): string {
  return costUsd === undefined ? 'unknown' : `$${costUsd.toFixed(6)}`;
}

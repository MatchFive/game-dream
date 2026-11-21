import { describe, expect, it } from 'vitest';
import type { ModelProvider } from '@gamedream/agent';
import { resolveTokenPricing, tokenCostRates } from '../src/pricing.js';

const provider = (name: string, model?: string): ModelProvider => ({
  name,
  model,
  async complete() {
    return '';
  },
});

describe('token pricing', () => {
  it('uses the model table for known OpenAI models', () => {
    const pricing = resolveTokenPricing(provider('openai', 'gpt-4o-mini'), {});
    expect(pricing).toMatchObject({
      known: true,
      source: 'table',
      model: 'gpt-4o-mini',
      promptPerMTok: 0.15,
      completionPerMTok: 0.6,
    });
    expect(tokenCostRates(pricing)?.promptPerToken).toBeCloseTo(0.00000015);
  });

  it('uses explicit environment rates and reports unknown models', () => {
    const overridden = resolveTokenPricing(provider('openai', 'custom-model'), {
      GAMEDREAM_PRICE_PROMPT_PER_MTOK: '1',
      GAMEDREAM_PRICE_COMPLETION_PER_MTOK: '2',
      GAMEDREAM_PRICE_CACHED_PER_MTOK: '0.5',
    });
    expect(overridden).toMatchObject({ known: true, source: 'env', promptPerMTok: 1 });
    expect(tokenCostRates(overridden)?.cachedPerToken).toBeCloseTo(0.0000005);
    expect(resolveTokenPricing(provider('openai', 'custom-model'), {}).known).toBe(false);
    expect(resolveTokenPricing(provider('fake'), {}).source).toBe('fake');
  });
});

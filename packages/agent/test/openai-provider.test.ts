import { describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleProvider } from '../src/provider/openai-provider.js';
import { createProvider } from '../src/provider/create-provider.js';

const okResponse = {
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
};

describe('OpenAICompatibleProvider', () => {
  it('posts to chat/completions and returns message content', async () => {
    const fetchImpl = vi.fn(async () => okResponse as Response);
    const provider = new OpenAICompatibleProvider({
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      model: 'test-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const text = await provider.complete({ system: 's', user: 'u', temperature: 0.1 });
    expect(text).toBe('{"ok":true}');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('test-model');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('sends an explicit prompt_cache_key when a cache breakpoint is provided', async () => {
    const fetchImpl = vi.fn(async () => okResponse as Response);
    const provider = new OpenAICompatibleProvider({
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      model: 'test-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await provider.completeChatWithUsage({
      messages: [{ role: 'user', content: 'cache me' }],
      cacheKey: 'prefix-hash-123',
    });
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body.prompt_cache_key).toBe('prefix-hash-123');
  });

  it('throws a provider error on HTTP failure', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    })) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider({
      apiKey: 'bad',
      baseUrl: 'https://example.test/v1',
      model: 'test-model',
      fetchImpl,
    });
    await expect(provider.complete({ system: 's', user: 'u' })).rejects.toMatchObject({
      code: 'PROVIDER_HTTP_ERROR',
    });
  });

  it('throws when the response has no content', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [] }),
    })) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider({
      apiKey: 'k',
      baseUrl: 'https://example.test/v1',
      model: 'm',
      fetchImpl,
    });
    await expect(provider.complete({ system: 's', user: 'u' })).rejects.toMatchObject({
      code: 'PROVIDER_EMPTY_RESPONSE',
    });
  });

  it('classifies transport failures and never leaks the key', async () => {
    const secret = 'secret-key-value';
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider({
      apiKey: secret,
      baseUrl: 'https://example.test/v1',
      model: 'm',
      fetchImpl,
    });
    try {
      await provider.complete({ system: 's', user: 'u' });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toMatchObject({ code: 'PROVIDER_HTTP_ERROR' });
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it('times out a stalled provider', async () => {
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'TimeoutError')),
        );
      })) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider({
      apiKey: 'k',
      baseUrl: 'https://example.test/v1',
      model: 'm',
      timeoutMs: 10,
      fetchImpl,
    });
    await expect(provider.complete({ system: 's', user: 'u' })).rejects.toMatchObject({
      code: 'PROVIDER_HTTP_ERROR',
    });
  });

  it('classifies a malformed JSON body', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    })) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider({
      apiKey: 'k',
      baseUrl: 'https://example.test/v1',
      model: 'm',
      fetchImpl,
    });
    await expect(provider.complete({ system: 's', user: 'u' })).rejects.toMatchObject({
      code: 'PROVIDER_HTTP_ERROR',
    });
  });
});

describe('createProvider', () => {
  it('uses fake when auto has no API key', () => {
    expect(createProvider({ kind: 'auto', env: {} }).name).toBe('fake');
  });

  it('uses openai when auto has an API key', () => {
    expect(
      createProvider({
        kind: 'auto',
        env: { OPENAI_API_KEY: 'k', GAMEDREAM_MODEL: 'm' },
      }).name,
    ).toBe('openai');
  });

  it('fails openai without an API key', () => {
    try {
      createProvider({ kind: 'openai', env: {} });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toMatchObject({ code: 'MISSING_API_KEY' });
    }
  });
});

import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir } from '@gamedream/testing';
import { AgentError } from '../src/errors.js';
import { FakeVisionProvider } from '../src/vision/fake-vision-provider.js';
import { OpenAIVisionProvider } from '../src/vision/openai-vision-provider.js';
import { createVisionProvider } from '../src/vision/create-vision-provider.js';

function imagePath() {
  const path = join(makeTempDir('gamedream vision '), 'shot.png');
  writeFileSync(path, 'png-bytes', 'utf8');
  return path;
}

describe('vision providers', () => {
  it('fake defaults to a readable review', async () => {
    const review = await new FakeVisionProvider().review({
      imagePath: 'unused',
      system: 's',
      user: 'u',
    });
    expect(review).toMatchObject({
      readable: true,
      hud_visible: true,
      player_visible: true,
      enemy_visible: true,
      dialogue_readable: true,
    });
  });

  it('fake overrides fields', async () => {
    const review = await new FakeVisionProvider({
      review: { readable: false, issues: ['hud covered'] },
    }).review({ imagePath: 'unused', system: 's', user: 'u' });
    expect(review.readable).toBe(false);
    expect(review.issues).toEqual(['hud covered']);
  });

  it('openai vision sends a base64 image and parses the review', async () => {
    const path = imagePath();
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  readable: true,
                  hud_visible: true,
                  player_visible: true,
                  enemy_visible: true,
                  dialogue_readable: true,
                  issues: [],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    const provider = new OpenAIVisionProvider({
      apiKey: 'secret',
      baseUrl: 'https://example.test/v1',
      model: 'vision-model',
      fetchImpl,
    });
    const review = await provider.review({ imagePath: path, system: 's', user: 'u' });
    expect(review.readable).toBe(true);
    expect(body.model).toBe('vision-model');
    expect(JSON.stringify(body)).toContain('data:image/png;base64,');
  });

  it('rejects invalid review JSON', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"readable":true}' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;
    const provider = new OpenAIVisionProvider({
      apiKey: 'secret',
      baseUrl: 'https://example.test/v1',
      model: 'vision-model',
      fetchImpl,
    });
    await expect(
      provider.review({ imagePath: imagePath(), system: 's', user: 'u' }),
    ).rejects.toMatchObject({ code: 'INVALID_VISION_REVIEW' });
  });

  it('requires a key for openai', () => {
    expect(() => createVisionProvider({ kind: 'openai', env: {} })).toThrow(AgentError);
  });
});

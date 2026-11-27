import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModelProvider } from '@gamedream/agent';
import { extractJsonObject, loadKit, runSceneAgent, type SceneSpec } from '../src/index.js';

const kitPath = fileURLToPath(new URL('../kits/village-euro.json', import.meta.url));
const kit = loadKit(kitPath);

const goodSpec: SceneSpec = {
  id: 'riverbend',
  name: 'Riverbend',
  kind: 'village',
  kitId: kit.id,
  seed: 20261128,
  tileSize: 32,
  bounds: { width: 96, height: 80 },
  required: ['tavern', 'chapel'],
  decor: 0.5,
  water: 'river',
};

/** 按顺序吐出预设回复的 provider，用来驱动"初稿 → 修正"两条路径。 */
function scripted(replies: string[]): ModelProvider & { calls: number } {
  let index = 0;
  return {
    name: 'scripted',
    calls: 0,
    async complete() {
      this.calls += 1;
      const reply = replies[Math.min(index, replies.length - 1)];
      index += 1;
      return reply;
    },
  } as ModelProvider & { calls: number };
}

describe('scene agent', () => {
  it('accepts a valid first draft and tags the trace as agent work', async () => {
    const provider = scripted([JSON.stringify(goodSpec)]);
    const result = await runSceneAgent({ prompt: 'a riverside village with a tavern', kit, provider });

    expect(result.finished).toBe(true);
    expect(result.attempts).toHaveLength(1);
    expect(result.validation.pass).toBe(true);
    expect(result.traces[0].origin).toBe('agent');
    expect(result.traces[0].spec.id).toBe('riverbend');
    expect(provider.calls).toBe(1);
  });

  it('feeds the failed gates back and accepts a corrected draft', async () => {
    // 第一稿用了套件里不存在的建筑 id —— 模型幻觉，闸门报 missing-required
    const hallucinated = { ...goodSpec, required: ['grand-cathedral'] };
    const provider = scripted([JSON.stringify(hallucinated), JSON.stringify(goodSpec)]);
    const result = await runSceneAgent({ prompt: 'a village', kit, provider, maxAttempts: 3 });

    expect(result.attempts.length).toBeGreaterThanOrEqual(2);
    expect(result.finished).toBe(true);
    expect(result.traces[0].validation.pass).toBe(false);
    expect(result.traces[0].validation.issues.map((issue) => issue.code)).toContain('missing-required');
    expect(result.traces[1].validation.pass).toBe(true);
    expect(provider.calls).toBe(2);
  });

  it('survives an unparsable reply and retries', async () => {
    const provider = scripted(['I think you should build a village!', JSON.stringify(goodSpec)]);
    const result = await runSceneAgent({ prompt: 'a village', kit, provider, maxAttempts: 3 });

    expect(result.attempts[0].spec.id).toBe('invalid');
    expect(result.traces[0].steps.map((step) => step.summary).join(' ')).toMatch(/rejected/);
    expect(result.finished).toBe(true);
  });

  it('gives up after the attempt budget and reports the reason', async () => {
    const bad = { ...goodSpec, required: ['grand-cathedral'] };
    const provider = scripted([JSON.stringify(bad)]);
    const result = await runSceneAgent({ prompt: 'a village', kit, provider, maxAttempts: 2 });

    expect(result.finished).toBe(false);
    expect(result.attempts).toHaveLength(2);
    expect(result.failure).toContain('missing-required');
    expect(provider.calls).toBe(2);
  });

  it('appends one json line per attempt when a trace file is given', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamedream scene agent '));
    const file = join(dir, 'traces.jsonl');
    const provider = scripted([JSON.stringify(goodSpec)]);
    await runSceneAgent({ prompt: 'a village', kit, provider, traceFile: file });
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const trace = JSON.parse(lines[0]);
    expect(trace.origin).toBe('agent');
    expect(trace.validation.pass).toBe(true);
  });

  it('strips code fences and trailing prose from model output', () => {
    const wrapped = '```json\n{"id":"x"}\n```\nHope this helps!';
    expect(extractJsonObject(wrapped)).toBe('{"id":"x"}');
    expect(extractJsonObject('no json here')).toBeNull();
    // 嵌套对象要能正确配对
    expect(extractJsonObject('{"a":{"b":1},"c":2}')).toBe('{"a":{"b":1},"c":2}');
  });
});

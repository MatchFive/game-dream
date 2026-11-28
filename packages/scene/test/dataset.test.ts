import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readTraces,
  summarize,
  toPreferencePairs,
  toReviewPairs,
  toSftSamples,
  type SceneTrace,
} from '../src/index.js';

const SYSTEM = 'design scenes';

function trace(overrides: Partial<SceneTrace> & { specPatch?: Record<string, unknown> } = {}): SceneTrace {
  const { specPatch, ...rest } = overrides;
  return {
    schema: 1,
    id: rest.id ?? `trace-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: '2026-11-28T00:00:00.000Z',
    origin: 'agent',
    prompt: 'a riverside village',
    spec: {
      id: 'riverbend',
      name: 'Riverbend',
      kind: 'village',
      kitId: 'village-euro',
      seed: 1,
      tileSize: 32,
      bounds: { width: 96, height: 80 },
      required: [],
      decor: 0.5,
      water: 'river',
      ...specPatch,
    },
    kit: { id: 'village-euro', hash: 'kithash' },
    steps: [],
    validation: { pass: true, metrics: { density: 0.08 }, issues: [] },
    output: { layoutHash: 'hash-a', buildings: 10, props: 40, lots: 12 },
    durationMs: 5,
    ...rest,
  } as SceneTrace;
}

describe('dataset stats', () => {
  it('counts outcomes, issues and reviews', () => {
    const traces = [
      trace({ output: { layoutHash: 'a', buildings: 10, props: 40, lots: 12 } }),
      trace({
        id: 'b',
        validation: { pass: false, metrics: { density: 0.02 }, issues: [{ code: 'missing-required', detail: 'x' }] },
      }),
      trace({
        id: 'c',
        origin: 'manual',
        prompt: undefined,
        review: { verdict: 'good', at: '2026-11-28T01:00:00.000Z' },
      }),
    ];
    const stats = summarize(traces);
    expect(stats.total).toBe(3);
    expect(stats.passed).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.byOrigin).toEqual({ agent: 2, manual: 1 });
    expect(stats.issues).toEqual([{ code: 'missing-required', count: 1 }]);
    expect(stats.reviews.good).toBe(1);
    expect(stats.reviews.none).toBe(2);
    expect(stats.withPrompt).toBe(2);
    expect(stats.avgBuildings).toBe(10);
  });

  it('detects a determinism conflict per spec fingerprint', () => {
    const same = 'hash-a';
    const traces = [
      trace({ specPatch: { seed: 7 }, output: { layoutHash: same, buildings: 1, props: 1, lots: 1 } }),
      trace({ specPatch: { seed: 7 }, output: { layoutHash: same, buildings: 1, props: 1, lots: 1 } }),
      // 同 id、同 seed，但 required 不同 → 不同输入，不该算冲突
      trace({ specPatch: { seed: 7, required: ['tavern'] }, output: { layoutHash: 'other', buildings: 1, props: 1, lots: 1 } }),
      // 真正的冲突：完全相同的输入产出不同布局
      trace({ specPatch: { seed: 9 }, output: { layoutHash: 'x', buildings: 1, props: 1, lots: 1 } }),
      trace({ specPatch: { seed: 9 }, output: { layoutHash: 'y', buildings: 1, props: 1, lots: 1 } }),
    ];
    const stats = summarize(traces);
    expect(stats.determinism.conflicts).toHaveLength(1);
    expect(stats.determinism.stable).toBe(stats.determinism.groups - 1);
  });
});

describe('trace reading', () => {
  it('skips malformed lines instead of failing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamedream dataset '));
    const file = join(dir, 'traces.jsonl');
    writeFileSync(
      file,
      [JSON.stringify(trace()), '{ not json', '', JSON.stringify({ id: 'no-spec' }), JSON.stringify(trace({ id: 'ok-2' }))].join('\n'),
      'utf8',
    );
    const { traces, skipped } = readTraces(file);
    expect(traces.map((item) => item.id)).toEqual([traces[0].id, 'ok-2']);
    expect(skipped).toBe(2);
  });

  it('returns nothing for a missing file', () => {
    expect(readTraces(join(tmpdir(), 'definitely-missing-traces.jsonl')).traces).toEqual([]);
  });
});

describe('training exports', () => {
  it('keeps only passing agent samples with a prompt in the sft set', () => {
    const traces = [
      trace(),
      trace({ id: 'failing', validation: { pass: false, metrics: {}, issues: [{ code: 'overlap', detail: '' }] } }),
      trace({ id: 'no-prompt', prompt: undefined }),
      trace({ id: 'manual', origin: 'manual' }),
      trace({ id: 'invalid', specPatch: { id: 'invalid' } }),
    ];
    const samples = toSftSamples(traces, SYSTEM);
    expect(samples).toHaveLength(1);
    expect(samples[0].messages.map((message) => message.role)).toEqual(['system', 'user', 'assistant']);
    expect(samples[0].messages[0].content).toBe(SYSTEM);
    expect(JSON.parse(samples[0].messages[2].content).id).toBe('riverbend');
  });

  it('pairs a passing and a failing attempt of the same prompt', () => {
    const good = trace({ id: 'good' });
    const bad = trace({
      id: 'bad',
      validation: { pass: false, metrics: {}, issues: [{ code: 'missing-required', detail: 'x' }] },
    });
    const other = trace({ id: 'other', prompt: 'a mountain camp' });
    const pairs = toPreferencePairs([good, bad, other]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].prompt).toBe('a riverside village');
    expect(pairs[0].reason).toEqual(['missing-required']);
    expect(pairs[0].meta.chosenTrace).toBe('good');
  });

  it('uses human verdicts as preference pairs too', () => {
    const liked = trace({ id: 'liked', prompt: 'a village', review: { verdict: 'good', at: 'now' } });
    const disliked = trace({ id: 'disliked', prompt: 'a village', review: { verdict: 'bad', at: 'now' } });
    const pairs = toReviewPairs([liked, disliked]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].reason).toEqual(['human-review']);
  });

  it('counts what the model said it could not express', () => {
    // 24 条全过闸门的批次里，唯一有价值的质量信号就是模型自己声明的 unmet
    const stats = summarize([
      trace({ specPatch: { unmet: ['walled city (no wall support)'] } }),
      trace({ specPatch: { unmet: ['walled city (no wall support)', 'coast'] } }),
      trace({ specPatch: { unmet: [] } }),
    ]);

    expect(stats.withUnmet).toBe(2);
    expect(stats.unmet[0]).toEqual({ code: 'walled city (no wall support)', count: 2 });
    expect(stats.unmet.find((item) => item.code === 'coast')?.count).toBe(1);
  });
});

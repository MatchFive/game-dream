import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startStudioServer } from '../src/server.js';
import { exportBadcase, normalizeUnmet, sceneInsights } from '../src/insights.js';
import { saveScene, type StoredScene } from '../src/scenes.js';

/** 造一份最小可用的场景记录：看板只读 spec.unmet / validation / review。 */
function scene(
  root: string,
  input: {
    id: string;
    createdAt: string;
    issues?: string[];
    unmet?: string[];
    pass?: boolean;
    verdict?: 'good' | 'acceptable' | 'bad';
    buildings?: number;
  },
): StoredScene {
  const stored: StoredScene = {
    id: input.id,
    name: input.id,
    createdAt: input.createdAt,
    spec: { id: input.id, name: input.id, unmet: input.unmet ?? [] } as StoredScene['spec'],
    layout: {
      id: input.id,
      name: input.id,
      kind: 'village',
      kitId: 'village-euro',
      style: 'medieval-european',
      seed: 1,
      tileSize: 32,
      bounds: { width: 40, height: 40 },
      palette: { ground: '#ffffff', road: '#000000', plaza: '#000000', water: '#000000', green: '#000000' },
      roads: [],
      lots: [],
      buildings: new Array(input.buildings ?? 3).fill(0).map((_, index) => ({
        id: `b-${index}`,
        prefab: 'house-small',
        role: 'house',
        rect: { x: index * 6, y: 0, w: 5, h: 5 },
        facing: 2,
        entrance: [index * 6 + 2, 5],
        color: '#d9a15b',
        roof: 'gable',
        floors: 2,
        elevation: 0,
        band: 'street',
      })),
      props: [],
      anchors: [],
      walls: [],
      gates: [],
      cliffs: [],
      ramps: [],
      terraces: [],
      coastSide: null,
    },
    validation: {
      pass: input.pass ?? (input.issues ?? []).length === 0,
      metrics: { buildings: input.buildings ?? 3 },
      issues: (input.issues ?? []).map((code) => ({ code, detail: `${code} on b-0` })),
    },
    svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    traceId: `trace-${input.id}`,
    attempts: 1,
    review: input.verdict
      ? { verdict: input.verdict, notes: undefined, at: input.createdAt }
      : undefined,
  };
  return saveScene(root, stored);
}

describe('badcase insights', () => {
  it('drops the model parenthetical before clustering unmet phrases', () => {
    expect(normalizeUnmet('perimeter walls (no wall support)')).toBe('perimeter walls');
    expect(normalizeUnmet('  Coast  ')).toBe('coast');
    expect(normalizeUnmet('mountain elevation bands (no terrain) ')).toBe('mountain elevation bands');
    // 不同措辞不合并：它们确实是两件事
    expect(normalizeUnmet('walled city (no wall support)')).not.toBe(normalizeUnmet('perimeter walls'));
  });

  it('clusters by failure code and by unmet phrase, newest samples first', () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream insights '));
    scene(root, { id: 'a', createdAt: '2026-11-28T10:00:00.000Z', issues: ['unreachable', 'overlap'] });
    scene(root, { id: 'b', createdAt: '2026-11-28T11:00:00.000Z', issues: ['unreachable'] });
    scene(root, { id: 'c', createdAt: '2026-11-28T12:00:00.000Z', unmet: ['coast', 'coast (no shoreline)'] });
    scene(root, { id: 'd', createdAt: '2026-11-28T13:00:00.000Z', verdict: 'bad', issues: ['unreachable'] });

    const insights = sceneInsights(root);
    expect(insights.totals).toMatchObject({ scenes: 4, fail: 3, pass: 1, withUnmet: 1, reviewed: 1 });

    // unreachable 出现 3 次，排在 overlap（1 次）前面
    expect(insights.issues.map((cluster) => cluster.key)).toEqual(['unreachable', 'overlap']);
    const unreachable = insights.issues[0];
    expect(unreachable.count).toBe(3);
    expect(unreachable.bad).toBe(1);
    // 样本按创建时间倒序：最新那份在最前面，看板默认点开的就是它
    expect(unreachable.samples.map((sample) => sample.id)).toEqual(['d', 'b', 'a']);

    // 同一条 unmet 的两种说法落进同一簇，原话保留下来
    expect(insights.unmet).toHaveLength(1);
    expect(insights.unmet[0].key).toBe('coast');
    expect(insights.unmet[0].count).toBe(1);
    expect(insights.unmet[0].variants.sort()).toEqual(['coast', 'coast (no shoreline)']);
  });

  it('exports one jsonl line per sample in the selected bucket', () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream insights export '));
    scene(root, { id: 'a', createdAt: '2026-11-28T10:00:00.000Z', issues: ['unreachable'], buildings: 4 });
    scene(root, { id: 'b', createdAt: '2026-11-28T11:00:00.000Z', issues: ['unreachable'], buildings: 7 });
    scene(root, { id: 'c', createdAt: '2026-11-28T12:00:00.000Z', unmet: ['coast'] });

    const result = exportBadcase(root, { kind: 'issue', key: 'unreachable' });
    expect(result.count).toBe(2);
    expect(existsSync(result.file)).toBe(true);
    const lines = readFileSync(result.file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(lines.map((line) => line.id)).toEqual(['b', 'a']);
    // 只留结构，不落整份布局；但楼层/临街性质这些标签要带上
    expect(lines[0].buildings[0]).toMatchObject({ prefab: 'house-small', floors: 2, band: 'street' });
    expect(lines[0].issues[0].code).toBe('unreachable');

    // 不存在的簇导出空文件而不是抛错：看板可以放心点
    const missing = exportBadcase(root, { kind: 'unmet', key: 'nothing-here' });
    expect(missing.count).toBe(0);
    expect(readFileSync(missing.file, 'utf8')).toBe('');
  });

  it('serves the board over http and does not mistake it for a scene id', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream insights http '));
    scene(root, { id: 'a', createdAt: '2026-11-28T10:00:00.000Z', issues: ['unreachable'] });
    const studio = await startStudioServer({
      projectDir: root,
      port: 0,
      comfyui: { url: 'http://127.0.0.1:1', workflow: join(root, 'missing.json') },
    });
    try {
      const response = await fetch(`${studio.url}/api/scenes/insights`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        insights: { totals: { scenes: number }; issues: Array<{ key: string; count: number }> };
      };
      expect(body.insights.totals.scenes).toBe(1);
      expect(body.insights.issues[0]).toMatchObject({ key: 'unreachable', count: 1 });

      const exported = await fetch(`${studio.url}/api/scenes/insights/export`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'issue', key: 'unreachable' }),
      });
      expect(exported.status).toBe(200);
      const payload = (await exported.json()) as { export: { count: number } };
      expect(payload.export.count).toBe(1);

      // 缺参数要 400，而不是悄悄导全量
      const bad = await fetch(`${studio.url}/api/scenes/insights/export`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'issue' }),
      });
      expect(bad.status).toBe(400);
    } finally {
      await studio.close();
    }
  });
});

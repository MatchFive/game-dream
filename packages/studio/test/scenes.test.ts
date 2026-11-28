import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildScene, exportScene, listScenes, loadScene, reviewScene, scenesDir } from '../src/scenes.js';

const spec = {
  id: 'riverbend',
  name: 'Riverbend',
  kind: 'village' as const,
  kitId: 'village-euro',
  seed: 20261128,
  tileSize: 32,
  bounds: { width: 96, height: 80 },
  required: ['tavern', 'chapel'],
  decor: 0.5,
  water: 'river' as const,
};

describe('studio scene store', () => {
  it('builds a scene, renders it, and records a trace line', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream studio scenes '));
    const outcome = await buildScene(root, { spec });

    expect(outcome.finished).toBe(true);
    expect(outcome.scene.layout.buildings.length).toBeGreaterThan(0);
    expect(outcome.scene.svg.startsWith('<svg')).toBe(true);

    const traces = readFileSync(join(scenesDir(root), 'traces.jsonl'), 'utf8').trim().split('\n');
    expect(traces).toHaveLength(1);
    expect(JSON.parse(traces[0]).origin).toBe('manual');

    const loaded = loadScene(root, outcome.scene.id);
    expect(loaded?.name).toBe('Riverbend');
  });

  it('lists scenes newest first with a compact summary', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream studio scenes list '));
    await buildScene(root, { spec });
    await buildScene(root, { spec: { ...spec, id: 'lakeside', name: 'Lakeside' } });

    const scenes = listScenes(root);
    expect(scenes).toHaveLength(2);
    expect(scenes[0].buildings).toBeGreaterThan(0);
    expect(scenes[0]).toHaveProperty('pass');
    expect(JSON.stringify(scenes)).not.toContain('<svg');
  });

  it('stores a human review and appends it to the trace stream', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream studio scenes review '));
    const { scene } = await buildScene(root, { spec });

    const reviewed = reviewScene(root, scene.id, { verdict: 'good', notes: 'roads read well' });
    expect(reviewed.review?.verdict).toBe('good');
    expect(reviewed.review?.notes).toBe('roads read well');

    // 重新载入仍然带评审（不是只改了内存）
    expect(loadScene(root, scene.id)?.review?.verdict).toBe('good');

    const lines = readFileSync(join(scenesDir(root), 'traces.jsonl'), 'utf8').trim().split('\n');
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.review?.verdict).toBe('good');
    expect(last.steps[0].summary).toContain('human review');
  });

  it('exports a saved scene as an editable engine project', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream studio scenes export '));
    const outcome = await buildScene(root, { spec });

    const result = exportScene(root, outcome.scene.id);
    // 导出的是工程而不是图片：场景文件 + prefab + 瓦片资源都要在
    expect(existsSync(join(result.dir, 'project.godot'))).toBe(true);
    expect(existsSync(join(result.dir, 'scene/scene.tscn'))).toBe(true);
    expect(existsSync(join(result.dir, 'scene/tiles.tres'))).toBe(true);
    expect(existsSync(join(result.dir, 'prefabs', `${outcome.scene.layout.buildings[0].prefab}.tscn`))).toBe(true);

    const tscn = readFileSync(join(result.dir, 'scene/scene.tscn'), 'utf8');
    expect((tscn.match(/type="TileMapLayer"/g) ?? []).length).toBe(2);
    expect((tscn.match(/instance=ExtResource\("prefab_/g) ?? []).length)
      .toBe(outcome.scene.layout.buildings.length);
    expect(result.summary.buildings).toBe(outcome.scene.layout.buildings.length);
  });

  it('rejects unknown scenes and unsafe ids', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream studio scenes guard '));
    expect(loadScene(root, 'missing-scene')).toBeNull();
    expect(() => reviewScene(root, 'missing-scene', { verdict: 'bad' })).toThrow(/not found/);
    expect(() => loadScene(root, '../escape')).toThrow(/invalid scene id/);
  });

  it('keeps a failed build on disk for inspection', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream studio scenes fail '));
    // 套件里不存在 grand-cathedral，闸门必然报 missing-required
    const outcome = await buildScene(root, {
      spec: { ...spec, required: ['grand-cathedral'] },
    });
    expect(outcome.finished).toBe(false);
    expect(outcome.scene.validation.issues.map((issue) => issue.code)).toContain('missing-required');
    expect(existsSync(join(scenesDir(root), `${outcome.scene.id}.json`))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildScene,
  exportScene,
  listScenes,
  loadScene,
  reviewScene,
  scenesDir,
  tracesPath,
  writeSceneIndex,
} from '../src/scenes.js';

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

    const traces = readFileSync(tracesPath(root), 'utf8').trim().split('\n');
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

    const lines = readFileSync(tracesPath(root), 'utf8').trim().split('\n');
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.review?.verdict).toBe('good');
    expect(last.steps[0].summary).toContain('human review');
  });

  it('exports into the project, not into a detached studio folder', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream studio scenes export '));
    const outcome = await buildScene(root, { spec });

    const result = exportScene(root, outcome.scene.id);
    // 场景属于项目：落在 game/scenes/<id>/，共用工程里的 res:// 路径
    expect(result.dir).toBe(join(scenesDir(root), outcome.scene.id));
    // project.godot 在工程根，不在场景目录：场景目录里塞一份假工程只会让人误开错目录
    expect(existsSync(join(root, 'project.godot'))).toBe(true);
    expect(existsSync(join(result.dir, 'project.godot'))).toBe(false);
    expect(existsSync(join(result.dir, 'scene.tscn'))).toBe(true);
    expect(existsSync(join(result.dir, 'tiles.tres'))).toBe(true);
    expect(existsSync(join(result.dir, 'prefabs', `${outcome.scene.layout.buildings[0].prefab}.tscn`))).toBe(true);
    // 场景数据与预览也在项目里，游戏/工具不必回读 .gamedream
    expect(existsSync(join(result.dir, 'scene.json'))).toBe(true);
    expect(existsSync(join(result.dir, 'scene.svg'))).toBe(true);

    const tscn = readFileSync(join(result.dir, 'scene.tscn'), 'utf8');
    // 资源前缀必须是场景自己的目录：引擎从项目根解析 res://
    expect(tscn).toContain(`path="res://game/scenes/${outcome.scene.id}/tiles.tres"`);
    expect(tscn).toContain(`path="res://game/scenes/${outcome.scene.id}/prefabs/`);

    // 索引让游戏侧/项目 agent 能发现场景，不用猜目录名
    const index = JSON.parse(readFileSync(join(scenesDir(root), 'index.json'), 'utf8')) as {
      scenes: Array<{ id: string; resPath: string }>;
    };
    expect(index.scenes.map((entry) => entry.id)).toContain(outcome.scene.id);
    expect(index.scenes[0].resPath).toBe(`res://game/scenes/${outcome.scene.id}/scene.tscn`);
    // 地形 / 道路 / 道具三层：道具层是后加的，别让它在导出路径上被漏掉
    expect((tscn.match(/type="TileMapLayer"/g) ?? []).length).toBe(3);
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
    expect(existsSync(join(scenesDir(root), outcome.scene.id, 'scene.json'))).toBe(true);
  });
});

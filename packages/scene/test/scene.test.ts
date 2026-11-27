import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendTrace,
  buildSceneWithTrace,
  exportGodotScene,
  hashLayout,
  loadKit,
  renderSceneSvg,
  validateScene,
  type SceneLayout,
} from '../src/index.js';

const kitPath = fileURLToPath(new URL('../kits/village-euro.json', import.meta.url));
const kit = loadKit(kitPath);

const baseSpec = {
  id: 'riverbend',
  name: '河湾村',
  kind: 'village' as const,
  kitId: kit.id,
  seed: 20261128,
  tileSize: 32,
  bounds: { width: 96, height: 80 },
  required: ['tavern', 'chapel', 'smithy'],
  decor: 0.5,
  water: 'river' as const,
};

describe('scene solver', () => {
  it('produces a layout that passes every gate', () => {
    const { layout, validation } = buildSceneWithTrace(baseSpec, kit);
    expect(validation.issues).toEqual([]);
    expect(validation.pass).toBe(true);
    expect(layout.buildings.length).toBeGreaterThanOrEqual(3);
    expect(validation.metrics.entranceCoverage).toBe(1);
  });

  it('places every required prefab', () => {
    const { layout } = buildSceneWithTrace(baseSpec, kit);
    const placed = new Set(layout.buildings.map((building) => building.prefab));
    for (const required of baseSpec.required) expect(placed.has(required)).toBe(true);
  });

  it('is deterministic for a seed and different across seeds', () => {
    const a = buildSceneWithTrace(baseSpec, kit);
    const b = buildSceneWithTrace(baseSpec, kit);
    expect(hashLayout(a.layout)).toBe(hashLayout(b.layout));

    const other = buildSceneWithTrace({ ...baseSpec, seed: baseSpec.seed + 1 }, kit);
    expect(hashLayout(other.layout)).not.toBe(hashLayout(a.layout));
  });

  it('keeps entrances walkable across water variants', () => {
    for (const water of ['none', 'pond', 'river'] as const) {
      const { validation } = buildSceneWithTrace({ ...baseSpec, water }, kit);
      expect(validation.issues.filter((issue) => issue.code === 'unreachable')).toEqual([]);
      expect(validation.issues.filter((issue) => issue.code === 'blocked-entrance')).toEqual([]);
    }
  });

  it('scales down to a small camp without collapsing', () => {
    const { layout, validation } = buildSceneWithTrace(
      { ...baseSpec, kind: 'camp', bounds: { width: 40, height: 36 }, required: ['smithy'], decor: 0.3 },
      kit,
    );
    expect(layout.buildings.length).toBeGreaterThan(0);
    expect(validation.issues.filter((issue) => issue.code === 'out-of-bounds')).toEqual([]);
    expect(validation.issues.filter((issue) => issue.code === 'overlap')).toEqual([]);
  });

  it('renders an svg that contains the buildings and anchors', () => {
    const { layout } = buildSceneWithTrace(baseSpec, kit);
    const svg = renderSceneSvg(layout);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${layout.bounds.width * 12} ${layout.bounds.height * 12}"`);
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThan(layout.buildings.length);
    expect(svg).toContain('stroke-width="2"'); // 锚点圈
  });
});

describe('validation', () => {
  const walkAll = () => true;
  const reachAll = new Set<string>();
  const alwaysReachable = { has: () => true } as unknown as Set<string>;

  it('flags overlapping buildings', () => {
    const { layout } = buildSceneWithTrace(baseSpec, kit);
    const broken: SceneLayout = structuredClone(layout);
    broken.buildings[1].rect = { ...broken.buildings[0].rect };
    const report = validateScene(broken, { ...baseSpec, required: [] } as never, walkAll, alwaysReachable);
    expect(report.pass).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('overlap');
  });

  it('flags buildings pushed outside the map', () => {
    const { layout } = buildSceneWithTrace(baseSpec, kit);
    const broken: SceneLayout = structuredClone(layout);
    broken.buildings[0].rect = { x: layout.bounds.width + 4, y: 2, w: 5, h: 5 };
    const report = validateScene(broken, { ...baseSpec, required: [] } as never, walkAll, alwaysReachable);
    expect(report.issues.map((issue) => issue.code)).toContain('out-of-bounds');
  });

  it('flags entrances that cannot be reached', () => {
    const { layout } = buildSceneWithTrace(baseSpec, kit);
    const report = validateScene(layout, { ...baseSpec, required: [] } as never, walkAll, new Set());
    expect(report.metrics.entranceCoverage).toBe(0);
    expect(report.issues.map((issue) => issue.code)).toContain('unreachable');
  });
});

describe('trace dataset', () => {
  it('records inputs, steps, metrics and a stable output hash', () => {
    const { layout, trace } = buildSceneWithTrace(baseSpec, kit);
    expect(trace.schema).toBe(1);
    expect(trace.spec.id).toBe('riverbend');
    expect(trace.kit.id).toBe(kit.id);
    expect(trace.kit.hash).toHaveLength(16);
    expect(trace.steps.map((step) => step.phase)).toEqual(['plan', 'layout', 'validate']);
    expect(trace.validation.pass).toBe(true);
    expect(trace.output.layoutHash).toBe(hashLayout(layout));
    expect(trace.output.buildings).toBe(layout.buildings.length);
  });

  it('appends one json line per attempt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamedream traces '));
    const file = join(dir, 'scenes.jsonl');
    appendTrace(file, buildSceneWithTrace(baseSpec, kit).trace);
    appendTrace(file, buildSceneWithTrace({ ...baseSpec, seed: 7 }, kit).trace);
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]);
    expect(first.schema).toBe(1);
    expect(first.validation.metrics.buildings).toBeGreaterThan(0);
  });

  it('marks agent-originated traces differently from solver ones', () => {
    const { trace } = buildSceneWithTrace(baseSpec, kit, { origin: 'agent' });
    expect(trace.origin).toBe('agent');
  });
});

describe('godot export', () => {
  it('writes a loadable project with matching node counts', () => {
    const { layout } = buildSceneWithTrace(baseSpec, kit);
    const dir = mkdtempSync(join(tmpdir(), 'gamedream godot scene '));
    const result = exportGodotScene(layout, dir);

    for (const file of result.files) {
      expect(existsSync(join(dir, file))).toBe(true);
    }

    const tscn = readFileSync(join(dir, 'scene/scene.tscn'), 'utf8');
    // header 的 load_steps 必须等于 ext + sub + 1，否则 Godot 会报 Unexpected end of file
    const loadSteps = Number((tscn.match(/load_steps=(\d+)/) ?? [])[1]);
    const ext = (tscn.match(/^\[ext_resource/gm) ?? []).length;
    const sub = (tscn.match(/^\[sub_resource/gm) ?? []).length;
    expect(loadSteps).toBe(ext + sub + 1);

    // 每栋建筑一个 StaticBody2D + 碰撞体 + 入口标记
    // 建筑各一个 + Walls 容器本身
    expect((tscn.match(/type="StaticBody2D"/g) ?? []).length).toBe(layout.buildings.length + 1);
    expect((tscn.match(/type="CollisionShape2D"/g) ?? []).length)
      .toBe(layout.buildings.length + 4); // 每栋建筑一个 + 四面边界墙
    expect((tscn.match(/parent="Buildings"/g) ?? []).length).toBe(layout.buildings.length);
    expect((tscn.match(/parent="Anchors"/g) ?? []).length).toBe(layout.anchors.length);
    expect(tscn).not.toContain('/>'); // Godot 4 的 ext_resource 用 ] 结尾
  });

  it('reports a summary that matches the layout', () => {
    const { layout } = buildSceneWithTrace(baseSpec, kit);
    const dir = mkdtempSync(join(tmpdir(), 'gamedream godot scene summary '));
    const result = exportGodotScene(layout, dir);
    expect(result.summary.buildings).toBe(layout.buildings.length);
    expect(result.summary.anchors).toBe(layout.anchors.length);
    expect(result.summary.collisions).toBeGreaterThan(0);
  });
});

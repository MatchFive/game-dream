#!/usr/bin/env node
// 场景 → Godot 导出冒烟：导出三个示例场景，用真实引擎加载，核对节点数量。
// 需要 GODOT_BIN；缺引擎时打印 SKIP 并退出 0（加 --require 则退出 3）。
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSceneWithTrace, exportGodotScene, loadKit } from '../packages/scene/dist/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const outRoot = resolve(root, 'dist/scene-godot-smoke');
const requireEngine = process.argv.includes('--require');

const bin = process.env.GODOT_BIN;
if (!bin || !existsSync(bin)) {
  console.log('GODOT_SCENE_SKIP=1');
  console.log('reason=GODOT_BIN not set');
  process.exit(requireEngine ? 3 : 0);
}

const kit = loadKit(join(root, 'packages/scene/kits/village-euro.json'));
const cases = [
  { id: 'riverbend', seed: 20261128, bounds: { width: 96, height: 80 }, required: ['tavern', 'chapel', 'smithy'], water: 'river', kind: 'village' },
  { id: 'stonecross', seed: 424242, bounds: { width: 120, height: 96 }, required: ['market-hall', 'chapel', 'tavern'], water: 'pond', kind: 'town' },
  { id: 'lakeside', seed: 7, bounds: { width: 56, height: 48 }, required: ['smithy'], water: 'pond', kind: 'camp' },
];

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

let failures = 0;
for (const scene of cases) {
  const spec = { ...scene, name: scene.id, kitId: kit.id, tileSize: 32, decor: 0.5 };
  const { layout, validation } = buildSceneWithTrace(spec, kit);
  const dir = join(outRoot, scene.id);
  exportGodotScene(layout, dir);

  // Godot 需要先导入资源（生成 .import），否则 Texture2D 加载失败
  spawnSync(bin, ['--headless', '--path', dir, '--import'], { cwd: dir, encoding: 'utf8' });
  const run = spawnSync(bin, ['--headless', '--path', dir], { cwd: dir, encoding: 'utf8' });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  writeFileSync(join(dir, 'godot-run.log'), output, 'utf8');

  const read = (name) => {
    const match = output.match(new RegExp(`${name}=(\\d+)`));
    return match ? Number(match[1]) : -1;
  };
  const buildings = read('GAMEDREAM_SCENE_BUILDINGS');
  const entrances = read('GAMEDREAM_SCENE_ENTRANCES');
  const anchors = read('GAMEDREAM_SCENE_ANCHORS');
  const tilesGround = read('GAMEDREAM_TILES_GROUND');
  const tilesRoads = read('GAMEDREAM_TILES_ROADS');
  const navTotal = read('GAMEDREAM_NAV_TOTAL');
  const navReached = read('GAMEDREAM_NAV_REACHED');
  const ok = output.includes('GAMEDREAM_SCENE_OK=1');

  const expected = layout.buildings.length;
  const problems = [];
  if (!ok) problems.push('scene script did not report OK');
  if (buildings !== expected) problems.push(`buildings ${buildings} != ${expected}`);
  if (entrances !== expected) problems.push(`entrances ${entrances} != ${expected}`);
  if (anchors !== layout.anchors.length) problems.push(`anchors ${anchors} != ${layout.anchors.length}`);
  if (!validation.pass) problems.push('layout gates failed');
  if (navTotal !== expected) problems.push(`nav targets ${navTotal} != ${expected}`);
  if (navReached !== expected) problems.push(`nav unreachable ${expected - navReached}`);
  // 瓦片层：地形层必须铺满整张图，道路层必须有格子，atlas 必须挂上
  const cells = layout.bounds.width * layout.bounds.height;
  if (tilesGround !== cells) problems.push(`ground tiles ${tilesGround} != ${cells}`);
  if (tilesRoads <= 0) problems.push('road tiles missing');
  if (!output.includes('GAMEDREAM_TILES_ATLAS=true')) problems.push('tile atlas missing');

  if (problems.length > 0) {
    failures += 1;
    console.log(`SCENE_GODOT_FAIL=${scene.id}: ${problems.join('; ')}`);
  } else {
    console.log(
      `SCENE_GODOT_OK=${scene.id} buildings=${buildings} entrances=${entrances} nav=${navReached}/${navTotal} `
      + `anchors=${anchors} tiles=${tilesGround}/${tilesRoads} `
      + `spawn=${(output.match(/GAMEDREAM_SCENE_SPAWN=([\d,]+)/) ?? [])[1] ?? 'n/a'}`,
    );
  }
}

console.log(failures === 0 ? 'GODOT_SCENE_OK=1' : 'GODOT_SCENE_OK=0');
process.exit(failures === 0 ? 0 : 1);

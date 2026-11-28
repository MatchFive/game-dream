#!/usr/bin/env node
// 场景 → Godot 导出回归：导出六个示例场景，能用真引擎就用真引擎加载并核对节点、
// 瓦片、墙体、道具、导航可达性。
//
// 没有引擎时**不是什么都不做**：仍然把六个工程导出来，并核对布局闸门、文件结构、
// 碰撞体数量（这些不需要引擎）。然后显式打印 SKIP + 原因，退出 0。
// 加 --require 则把"没有引擎"当失败（退出 3），供确定要跑引擎的 CI job 使用。
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSceneWithTrace, exportGodotScene, loadKit } from '../packages/scene/dist/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const outRoot = resolve(root, 'dist/scene-godot-smoke');
const requireEngine = process.argv.includes('--require');

const bin = process.env.GODOT_BIN;
const hasEngine = Boolean(bin && existsSync(bin));
if (!hasEngine && requireEngine) {
  console.log('GODOT_SCENE_SKIP=1');
  console.log('reason=GODOT_BIN not set or missing (--require: skipped engine is a failure)');
  process.exit(3);
}

const kit = loadKit(join(root, 'packages/scene/kits/village-euro.json'));
const cases = [
  { id: 'riverbend', seed: 20261128, bounds: { width: 96, height: 80 }, required: ['tavern', 'chapel', 'smithy'], water: 'river', kind: 'village' },
  { id: 'stonecross', seed: 424242, bounds: { width: 120, height: 96 }, required: ['market-hall', 'chapel', 'tavern'], water: 'pond', kind: 'town' },
  { id: 'lakeside', seed: 7, bounds: { width: 56, height: 48 }, required: ['smithy'], water: 'pond', kind: 'camp' },
  // S13：三种新地形各一条。它们不是"多一个 case"，而是各自会打开不同的代码路径——
  // 海岸改水面与岸线、城墙往场景里塞静态碰撞体、高程改导航网格的连通形状。
  { id: 'cliffharbor', seed: 4111, bounds: { width: 110, height: 92 }, required: ['chapel', 'tavern', 'dock-house'], water: 'coast', kind: 'town' },
  { id: 'walledquarter', seed: 4222, bounds: { width: 120, height: 100 }, required: ['chapel', 'market-hall', 'tavern'], water: 'none', walls: { enabled: true, thickness: 1, setback: 3 }, kind: 'town' },
  { id: 'terracevillage', seed: 4333, bounds: { width: 96, height: 110 }, required: ['chapel', 'smithy'], water: 'none', elevation: { levels: 2, step: 13, from: 'north' }, kind: 'village' },
];

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

let failures = 0;
for (const scene of cases) {
  const spec = { ...scene, name: scene.id, kitId: kit.id, tileSize: 32, decor: 0.5 };
  const { layout, validation } = buildSceneWithTrace(spec, kit);
  const dir = join(outRoot, scene.id);
  const exported = exportGodotScene(layout, dir);
  const tscn = readFileSync(join(dir, 'scene', 'scene.tscn'), 'utf8');
  const tiles = exported.summary.tiles;

  const problems = [];
  if (!validation.pass) problems.push(`layout gates failed: ${validation.issues.map((i) => i.code).join(',')}`);
  // 结构断言不需要引擎：文件在不在、图层数、碰撞体数、格子数与 layout 对不对得上
  for (const file of ['project.godot', 'scene/scene.tscn', 'scene/tiles.png', 'scene/tiles.tres', 'scene/layout.json']) {
    if (!existsSync(join(dir, file))) problems.push(`missing ${file}`);
  }
  const layers = (tscn.match(/type="TileMapLayer"/g) ?? []).length;
  const expectedLayers = tiles.propCells > 0 ? 3 : 2;
  if (layers !== expectedLayers) problems.push(`tile layers ${layers} != ${expectedLayers}`);
  if (tiles.cells !== layout.bounds.width * layout.bounds.height) problems.push('ground cells != bounds');
  if (tiles.roadCells <= 0) problems.push('road tiles missing');
  if (tiles.propCells !== layout.props.length) problems.push(`prop cells ${tiles.propCells} != ${layout.props.length}`);
  if ((tscn.match(/parent="TownWalls"/g) ?? []).length !== layout.walls.length) problems.push('wall bodies != layout.walls');
  if ((tscn.match(/parent="Cliffs"/g) ?? []).length !== layout.cliffs.length) problems.push('cliff bodies != layout.cliffs');
  if ((tscn.match(/instance=ExtResource\("prefab_/g) ?? []).length !== layout.buildings.length) {
    problems.push('prefab instances != layout.buildings');
  }

  let engineLine = 'engine=skipped';
  if (hasEngine) {
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
    const tilesProps = read('GAMEDREAM_TILES_PROPS');
    const navTotal = read('GAMEDREAM_NAV_TOTAL');
    const navReached = read('GAMEDREAM_NAV_REACHED');
    const townWalls = read('GAMEDREAM_SCENE_WALLS');
    const cliffs = read('GAMEDREAM_SCENE_CLIFFS');
    const lights = read('GAMEDREAM_SCENE_LIGHTS');
    const zones = read('GAMEDREAM_SCENE_ZONES');
    const markers = read('GAMEDREAM_SCENE_MARKERS');
    const interactions = read('GAMEDREAM_SCENE_INTERACTIONS');
    const kinds = (output.match(/GAMEDREAM_SCENE_INTERACTION_KINDS=(.*)/) ?? [])[1]?.trim() ?? '';
    const ok = output.includes('GAMEDREAM_SCENE_OK=1');

    const expected = layout.buildings.length;
    if (!ok) problems.push('scene script did not report OK');
    if (buildings !== expected) problems.push(`buildings ${buildings} != ${expected}`);
    if (entrances !== expected) problems.push(`entrances ${entrances} != ${expected}`);
    if (anchors !== layout.anchors.length) problems.push(`anchors ${anchors} != ${layout.anchors.length}`);
    if (navTotal !== expected) problems.push(`nav targets ${navTotal} != ${expected}`);
    if (navReached !== expected) problems.push(`nav unreachable ${expected - navReached}`);
    if (townWalls !== layout.walls.length) problems.push(`wall bodies ${townWalls} != ${layout.walls.length}`);
    if (cliffs !== layout.cliffs.length) problems.push(`cliff bodies ${cliffs} != ${layout.cliffs.length}`);
    const cells = layout.bounds.width * layout.bounds.height;
    if (tilesGround !== cells) problems.push(`ground tiles ${tilesGround} != ${cells}`);
    if (tilesRoads <= 0) problems.push('road tiles missing (engine)');
    if (tilesProps !== layout.props.length) problems.push(`prop tiles ${tilesProps} != ${layout.props.length}`);
    // 楼层以节点元数据进场景：引擎侧能读到，说明"高度"不是只存在于 layout.json
    const floors = read('GAMEDREAM_SCENE_FLOORS');
    const floorsExpected = layout.buildings.reduce((sum, b) => sum + b.floors, 0);
    if (floors !== floorsExpected) problems.push(`floors ${floors} != ${floorsExpected}`);

    // kit 挂在 prefab 上的节点必须真的出现在引擎里：灯没贴图就不亮，区没有形状就触发不了
    const countNodes = (type) => layout.buildings.reduce((sum, building) => {
      const prefab = kit.prefabs.find((entry) => entry.id === building.prefab);
      return sum + (prefab?.nodes ?? []).filter((node) => node.type === type).length;
    }, 0);
    if (lights !== countNodes('light')) problems.push(`lights ${lights} != ${countNodes('light')}`);
    if (zones !== countNodes('area')) problems.push(`zones ${zones} != ${countNodes('area')}`);
    if (markers !== countNodes('marker')) problems.push(`markers ${markers} != ${countNodes('marker')}`);
    // 交互点：数量要对，kind 集合也要对——只剩数量对而类型错，等于游戏里什么都触发不了
    if (interactions !== layout.interactions.length) {
      problems.push(`interactions ${interactions} != ${layout.interactions.length}`);
    }
    // 引擎里的顺序按节点遍历来，和 layout 不一致是正常的，比集合
    const expectedKinds = [...new Set(layout.interactions.map((item) => item.kind))].sort().join(',');
    const reportedKinds = (kinds ? kinds.split(',') : []).sort().join(',');
    if (reportedKinds !== expectedKinds) problems.push(`interaction kinds "${reportedKinds}" != "${expectedKinds}"`);
    if (!output.includes('GAMEDREAM_TILES_ATLAS=true')) problems.push('tile atlas missing');

    engineLine = `buildings=${buildings} entrances=${entrances} nav=${navReached}/${navTotal}`
      + ` anchors=${anchors} tiles=${tilesGround}/${tilesRoads}/${tilesProps}`
      + ` walls=${townWalls} cliffs=${cliffs} floors=${read('GAMEDREAM_SCENE_FLOORS')}`
      + ` lights=${lights} zones=${zones} markers=${markers} interactions=${interactions}[${kinds}]`
      + ` spawn=${(output.match(/GAMEDREAM_SCENE_SPAWN=([\d,]+)/) ?? [])[1] ?? 'n/a'}`;
  }

  if (problems.length > 0) {
    failures += 1;
    console.log(`SCENE_GODOT_FAIL=${scene.id}: ${problems.join('; ')}`);
  } else {
    const structural = `layout=${layout.buildings.length}b/${layout.walls.length}w/${layout.cliffs.length}c`
      + `/${layout.props.length}p tiles=${tiles.cells}/${tiles.roadCells}/${tiles.propCells}`;
    console.log(`SCENE_GODOT_OK=${scene.id} ${engineLine} ${hasEngine ? '' : structural}`.trim());
  }
}

if (!hasEngine) {
  console.log('GODOT_SCENE_SKIP=1');
  console.log(`reason=GODOT_BIN not set; ${cases.length} projects exported and structurally checked in ${outRoot}`);
  console.log('hint=set GODOT_BIN=<godot> to also load them in a real engine');
}

console.log(failures === 0 ? 'GODOT_SCENE_OK=1' : 'GODOT_SCENE_OK=0');
process.exit(failures === 0 ? 0 : 1);

import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendTrace,
  parseSceneSpec,
  parseKit,
  villageEuroKit,
  writeKitArtwork,
  buildScene,
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
  it('instances prefabs instead of baking every building into the scene', () => {
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

    // 建筑一律是 prefab 实例：场景里只剩 Walls 一个 StaticBody2D
    const usedPrefabs = new Set(layout.buildings.map((building) => building.prefab));
    expect((tscn.match(/instance=ExtResource\("prefab_/g) ?? []).length).toBe(layout.buildings.length);
    expect((tscn.match(/type="StaticBody2D"/g) ?? []).length).toBe(1);

    // 每个用到的 prefab 都有自己的场景文件，且结构完整
    for (const prefab of usedPrefabs) {
      const file = join(dir, 'prefabs', `${prefab}.tscn`);
      expect(existsSync(file)).toBe(true);
      const prefabText = readFileSync(file, 'utf8');
      expect(prefabText).toContain('type="StaticBody2D"');
      expect(prefabText).toContain('[node name="Art"');
      expect(prefabText).toContain('[node name="Body" type="CollisionShape2D"');
    }

    // 每栋建筑的尺寸/入口靠属性覆盖，而不是复制节点树
    expect((tscn.match(/\[node name="Art" parent="Buildings\//g) ?? []).length).toBe(layout.buildings.length);
    expect((tscn.match(/\[node name="Body" parent="Buildings\//g) ?? []).length).toBe(layout.buildings.length);
    expect((tscn.match(/\[node name="Entrance" type="Marker2D" parent="Buildings\//g) ?? []).length)
      .toBe(layout.buildings.length);
    expect((tscn.match(/parent="Anchors"/g) ?? []).length).toBe(layout.anchors.length);
    expect(tscn).not.toContain('/>'); // Godot 4 的 ext_resource 用 ] 结尾
  });

  it('paints ground, roads and props as tile layers', () => {
    const { layout } = buildSceneWithTrace(baseSpec, kit);
    const dir = mkdtempSync(join(tmpdir(), 'gamedream godot tiles '));
    const result = exportGodotScene(layout, dir);
    const tscn = readFileSync(join(dir, 'scene/scene.tscn'), 'utf8');

    // 地形 / 道路 / 道具三层
    expect((tscn.match(/type="TileMapLayer"/g) ?? []).length).toBe(3);
    expect(tscn).toContain('tile_set = ExtResource("2_tileset")');
    expect((tscn.match(/tile_map_data = PackedByteArray\(/g) ?? []).length).toBe(3);

    // 地形层必须铺满整张图：漏一格就会露出引擎底色
    const cells = layout.bounds.width * layout.bounds.height;
    expect(result.summary.tiles.cells).toBe(cells);
    expect(result.summary.tiles.roadCells).toBeGreaterThan(0);

    // tile_map_data：2 字节版本号 + 每格 12 字节
    const first = (tscn.match(/tile_map_data = PackedByteArray\(([^)]*)\)/) ?? [])[1] ?? '';
    const bytes = first.split(',').length;
    expect(bytes).toBe(2 + cells * 12);

    // atlas 与 TileSet 资源都要落盘，且每个地形至少一个瓦片
    expect(existsSync(join(dir, 'scene/tiles.png'))).toBe(true);
    const tres = readFileSync(join(dir, 'scene/tiles.tres'), 'utf8');
    expect(tres).toContain('TileSetAtlasSource');
    const tiles = (tres.match(/^\d+:0\/0 = 0$/gm) ?? []).length;
    expect(tiles).toBeGreaterThanOrEqual(5);
  });

  it('emits a navigation mesh built from walkable cells', () => {
    const { layout } = buildSceneWithTrace(baseSpec, kit);
    const dir = mkdtempSync(join(tmpdir(), 'gamedream godot nav '));
    const result = exportGodotScene(layout, dir);
    const tscn = readFileSync(join(dir, 'scene/scene.tscn'), 'utf8');

    expect(tscn).toContain('type="NavigationRegion2D"');
    expect(tscn).toContain('type="NavigationPolygon"');
    expect(result.summary.navPolygons).toBeGreaterThan(0);

    // 顶点按整数坐标去重：几何相邻的多边形必须共享同一批顶点索引，
    // 否则导航服务器不会把它们连通
    const vertices = Number((tscn.match(/vertices = PackedVector2Array\(([^)]*)\)/) ?? [])[1]?.split(',').length ?? 0) / 2;
    expect(vertices).toBeGreaterThan(0);
    expect(vertices).toBe(result.summary.navVertices);

    // 建筑与水面的格子不能出现在导航网格里
    const blockedCells = layout.buildings.reduce((sum, building) => sum + building.rect.w * building.rect.h, 0);
    const walkable = layout.bounds.width * layout.bounds.height - blockedCells;
    expect(result.summary.navPolygons).toBeLessThan(walkable);
    expect(exportGodotScene(layout, dir).summary.navPolygons).toBe(result.summary.navPolygons);
  });

  it('reports a summary that matches the layout', () => {
    const { layout } = buildSceneWithTrace(baseSpec, kit);
    const dir = mkdtempSync(join(tmpdir(), 'gamedream godot scene summary '));
    const result = exportGodotScene(layout, dir);
    expect(result.summary.buildings).toBe(layout.buildings.length);
    expect(result.summary.anchors).toBe(layout.anchors.length);
    expect(result.summary.prefabs).toBe(new Set(layout.buildings.map((b) => b.prefab)).size);
  });

  it('puts props into the engine as a transparent tile layer', () => {
    // 道具以前只画在预览 SVG 里，导出的城是空的——院子、广场、街边什么都没有
    const { layout } = buildSceneWithTrace(baseSpec, kit);
    expect(layout.props.length).toBeGreaterThan(10);
    const dir = mkdtempSync(join(tmpdir(), 'gamedream props '));
    const result = exportGodotScene(layout, dir);
    const tscn = readFileSync(join(dir, 'scene/scene.tscn'), 'utf8');
    expect(tscn).toContain('node name="Props" type="TileMapLayer"');
    const tiles = result.summary.tiles as { propCells: number };
    expect(tiles.propCells).toBe(layout.props.length);
    // 道具层必须排在地形和道路之后，否则会被地面盖住
    expect(tscn.indexOf('node name="Props"')).toBeGreaterThan(tscn.indexOf('node name="Roads"'));
    // 一格只放一个道具：叠在一起引擎里只会画出一个，计数也会对不上
    const unique = new Set(layout.props.map((prop) => `${prop.at[0]},${prop.at[1]}`));
    expect(unique.size).toBe(layout.props.length);
  });
});

describe('builtin kit', () => {
  it('matches the editable json kit', () => {
    // 内置对象与 kits/*.json 必须一致，否则 CLI/Studio 与文档会悄悄分叉
    // 用 schema 归一化后再比：JSON 里省略的默认字段（如 mainRoad:false）会被补齐
    expect(parseKit(villageEuroKit)).toEqual(parseKit(JSON.parse(readFileSync(kitPath, 'utf8'))));
  });
});

describe('street grid on large maps', () => {
  it('adds secondary streets so a city is not one road across a field', () => {
    const city = { ...baseSpec, kind: 'city' as const, bounds: { width: 148, height: 116 } };
    const { layout, validation } = buildSceneWithTrace(city, kit);

    const streets = layout.roads.filter((road) => road.kind === 'street');
    expect(streets.length).toBeGreaterThan(4);
    // 街区网格应该让建筑数量显著高于只有一条主路时
    expect(layout.buildings.length).toBeGreaterThan(30);
    expect(validation.metrics.density).toBeGreaterThan(0.1);
    expect(validation.pass).toBe(true);
  });

  it('keeps villages on the simple cross road', () => {
    const { layout } = buildSceneWithTrace(baseSpec, kit);
    expect(layout.roads.filter((road) => road.kind === 'street')).toHaveLength(0);
  });
});

describe('artwork layer', () => {
  it('generates one png per prefab with a manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamedream scene art '));
    const manifest = writeKitArtwork(kit, dir, { tileSize: 32 });
    expect(manifest.entries).toHaveLength(kit.prefabs.length);
    for (const entry of manifest.entries) {
      expect(existsSync(join(dir, entry.file))).toBe(true);
      expect(entry.width).toBeGreaterThan(0);
    }
    // 贴图尺寸必须贴合 footprint 上限，导出时才能按比例铺满
    const chapel = manifest.entries.find((entry) => entry.prefab === 'chapel');
    const prefab = kit.prefabs.find((item) => item.id === 'chapel');
    expect(chapel?.width).toBe((prefab?.footprint.maxWidth ?? 0) * 32);
  });

  it('uses Sprite2D when artwork is available and Polygon2D when not', () => {
    const { layout } = buildSceneWithTrace(baseSpec, kit);
    const dir = mkdtempSync(join(tmpdir(), 'gamedream scene art export '));
    writeKitArtwork(kit, join(dir, 'art'), { tileSize: 32 });

    const withArt = exportGodotScene(layout, join(dir, 'with'), { artDir: join(dir, 'art') });
    const sceneWith = readFileSync(join(dir, 'with', 'scene/scene.tscn'), 'utf8');
    expect(withArt.summary.textures).toBeGreaterThan(0);
    expect(sceneWith).toContain('scale = Vector2(');
    expect(existsSync(join(dir, 'with', 'scene/art', 'house-small.png'))).toBe(true);
    // 贴图挂在 prefab 上：换图改一个文件就够
    const prefabWithArt = readFileSync(join(dir, 'with', 'prefabs', 'house-small.tscn'), 'utf8');
    expect(prefabWithArt).toContain('type="Sprite2D"');
    expect(prefabWithArt).toContain('Texture2D" path="res://scene/art/house-small.png"');

    const without = exportGodotScene(layout, join(dir, 'without'));
    expect(without.summary.textures).toBe(0);
    const prefabWithout = readFileSync(join(dir, 'without', 'prefabs', 'house-small.tscn'), 'utf8');
    expect(prefabWithout).toContain('type="Polygon2D"');
    // 没有贴图时实例仍然用 scale 拉到 footprint
    const sceneWithout = readFileSync(join(dir, 'without', 'scene/scene.tscn'), 'utf8');
    expect(sceneWithout).toContain('[node name="Art" parent="Buildings/');
  });

  it('embeds artwork into the svg preview', () => {
    const { layout } = buildSceneWithTrace(baseSpec, kit);
    const dir = mkdtempSync(join(tmpdir(), 'gamedream scene art svg '));
    writeKitArtwork(kit, join(dir, 'art'), { tileSize: 32 });
    const art = new Map<string, Buffer>();
    const houseFile = join(dir, 'art', kit.id, 'house-small.png');
    art.set('house-small', readFileSync(houseFile));
    const svg = renderSceneSvg(layout, { art });
    expect(svg).toContain('<image');
    expect(svg).toContain('data:image/png;base64,');
    // 没给素材的 prefab 仍然是色块
    expect(svg).toContain('<rect');
  });
});

describe('billboard artwork', () => {
  it('anchors sprites to the footprint bottom and keeps the aspect ratio', () => {
    const { layout } = buildSceneWithTrace(baseSpec, kit);
    const dir = mkdtempSync(join(tmpdir(), 'gamedream scene billboard '));
    writeKitArtwork(kit, join(dir, 'art'), { tileSize: 32 });

    const tiled = exportGodotScene(layout, join(dir, 'tile'), { artDir: join(dir, 'art') });
    const billboard = exportGodotScene(layout, join(dir, 'billboard'), {
      artDir: join(dir, 'art'),
      artStyle: 'billboard',
    });
    expect(tiled.summary.textures).toBe(billboard.summary.textures);

    const scene = readFileSync(join(dir, 'billboard', 'scene/scene.tscn'), 'utf8');
    // 等宽 + 底边对齐：每栋实例都覆盖 centered 与 offset
    expect((scene.match(/centered = false/g) ?? []).length).toBe(layout.buildings.length);
    expect(scene).toMatch(/offset = Vector2\(-[\d.]+, -[\d.]+\)/);
    // tile 模式不写负偏移：贴图直接铺满 footprint
    const tiledScene = readFileSync(join(dir, 'tile', 'scene/scene.tscn'), 'utf8');
    expect((tiledScene.match(/offset = Vector2\(0, 0\)/g) ?? []).length).toBe(layout.buildings.length);
  });
});

describe('settlement structure', () => {
  const town = { ...baseSpec, id: 'stonecross', kind: 'town' as const, bounds: { width: 120, height: 96 } };
  const distanceTo = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    Math.max(Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0), Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0));

  it('lines houses up along the street instead of scattering them', () => {
    const { layout, validation } = buildSceneWithTrace(town, kit);
    const walls = layout.buildings.filter((building) => building.typology === 'street-wall');

    // 大多数建筑应该贴街，而不是独立撒在地块中央
    expect(walls.length / layout.buildings.length).toBeGreaterThan(0.6);
    // 且相当一部分是共墙联排（不是一排独栋各留 2 格缝）
    expect(validation.metrics.attachedShare).toBeGreaterThan(0.3);
    expect(validation.metrics.standalone).toBe(0);
    expect(validation.pass).toBe(true);
  });

  it('carves a back lane behind a deep row, and every door stays reachable', () => {
    const { layout, validation } = buildSceneWithTrace(town, kit);
    const lanes = layout.roads.filter((road) => road.id.startsWith('lane-'));
    expect(lanes.length).toBeGreaterThan(2);
    // 巷道切出来以后，后排的门必须仍然能从出生点走到
    expect(validation.metrics.entranceCoverage).toBe(1);
    expect(validation.issues).toEqual([]);
  });

  it('gives courtyard lots a yard behind the house', () => {
    const { layout } = buildSceneWithTrace(town, kit);
    const courtyards = layout.buildings.filter((building) => building.typology === 'courtyard');
    expect(courtyards.length).toBeGreaterThan(0);
    // 带院落的宅子不会把地块占满：同一块地里要有绿地
    const yards = layout.lots.filter((lot) => lot.kind === 'green');
    expect(yards.length).toBeGreaterThan(0);
  });

  it('places a required civic building within sight of the square', () => {
    const { layout } = buildSceneWithTrace({ ...baseSpec, required: ['chapel', 'market-hall'] }, kit);
    const plaza = layout.lots.find((lot) => lot.kind === 'plaza')?.rect;
    expect(plaza).toBeDefined();
    const civic = layout.buildings.filter(
      (building) => building.role === 'civic' && distanceTo(building.rect, plaza as never) <= 5,
    );
    expect(civic.length).toBeGreaterThan(0);
  });
});

describe('skyline', () => {
  const townSpec = {
    ...baseSpec,
    id: 'skyline',
    kind: 'town' as const,
    bounds: { width: 120, height: 96 },
    required: ['market-hall', 'chapel', 'tavern'],
  };

  const mean = (values: number[]) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);
  const floorsOfBand = (layout: SceneLayout, band: string) =>
    layout.buildings.filter((building) => building.band === band).map((building) => building.floors);

  it('stacks height by frontage: main street tall, back lanes low', () => {
    const { layout } = buildScene(parseSceneSpec(townSpec), kit);
    const main = floorsOfBand(layout, 'main');
    const street = floorsOfBand(layout, 'street');
    const back = floorsOfBand(layout, 'back');

    expect(main.length).toBeGreaterThan(3);
    expect(street.length).toBeGreaterThan(10);
    expect(back.length).toBeGreaterThan(5);
    // 主街 > 次级街 > 背巷。这条链断了，"天际线"就退回成一把随机方块
    expect(mean(main)).toBeGreaterThan(mean(street) + 0.4);
    expect(mean(street)).toBeGreaterThan(mean(back) + 0.4);
    // 主街临街至少三层：一层商铺不像主街
    expect(Math.min(...main)).toBeGreaterThanOrEqual(3);
    // 背巷最多两层
    expect(Math.max(...back)).toBeLessThanOrEqual(2);
  });

  it('caps floors by settlement size instead of by luck', () => {
    const camp = buildScene(parseSceneSpec({
      ...baseSpec,
      kind: 'camp' as const,
      bounds: { width: 56, height: 48 },
      required: ['smithy'],
    }), kit).layout;
    expect(camp.buildings.length).toBeGreaterThan(5);
    // 营地全是棚屋：一条主街也救不出四层楼
    expect(Math.max(...camp.buildings.map((b) => b.floors))).toBeLessThanOrEqual(2);

    const town = buildScene(parseSceneSpec(townSpec), kit).layout;
    expect(Math.max(...town.buildings.map((b) => b.floors))).toBeLessThanOrEqual(4);
    expect(Math.min(...town.buildings.map((b) => b.floors))).toBeGreaterThanOrEqual(1);
  });

  it('casts a longer shadow for taller buildings in the preview', () => {
    const { layout } = buildScene(parseSceneSpec(townSpec), kit);
    const svg = renderSceneSvg(layout);
    const shadows = svg.match(/fill="#000000"/g) ?? [];
    // 平房（1 层、无高差）不投影；其余每栋一道，高度只靠这道影子表达
    const expected = layout.buildings.filter((building) => building.floors > 1 || building.elevation > 0).length;
    expect(shadows.length).toBe(expected);
    expect(expected).toBeGreaterThan(layout.buildings.length / 2);
  });

  it('writes the floor count into the exported scene as node metadata', () => {
    const { layout } = buildScene(parseSceneSpec(townSpec), kit);
    const dir = mkdtempSync(join(tmpdir(), 'gamedream floors '));
    const result = exportGodotScene(layout, dir);
    const tscn = readFileSync(join(dir, 'scene/scene.tscn'), 'utf8');

    // 引擎侧要读得到高度：不然"楼多高"只存在于 layout.json，游戏里还是平的
    const metas = tscn.match(/^metadata\/floors = (\d+)$/gm) ?? [];
    expect(metas.length).toBe(layout.buildings.length);
    const sum = metas.reduce((total, line) => total + Number(line.split('= ')[1]), 0);
    expect(sum).toBe(layout.buildings.reduce((total, building) => total + building.floors, 0));
    const floors = result.summary.floors as { mean: number; max: number };
    expect(floors.max).toBe(Math.max(...layout.buildings.map((b) => b.floors)));
  });
});

describe('unmet requests', () => {
  it('defaults to an empty list so old specs keep parsing', () => {
    const spec = parseSceneSpec({ ...baseSpec });
    expect(spec.unmet).toEqual([]);
  });

  it('keeps declared gaps and reports them as a metric', () => {
    const spec = { ...baseSpec, unmet: ['spring source', 'mine (no mine prefab)'] };
    const { layout, validation } = buildSceneWithTrace(spec, kit);
    // 声明 unmet 不该让布局失败：求解器没这个能力不是布局的错
    expect(validation.pass).toBe(true);
    expect(validation.metrics.unmet).toBe(2);
    expect(layout.buildings.length).toBeGreaterThan(0);
  });
});

describe('coast, walls and elevation', () => {
  const walkFromSpawn = (spec: Record<string, unknown>) => {
    const parsed = parseSceneSpec(spec);
    const { layout, grid } = buildScene(parsed, kit);
    const spawn = layout.anchors.find((anchor) => anchor.kind === 'spawn');
    expect(spawn).toBeDefined();
    const reachable = grid.flood((spawn as { at: [number, number] }).at[0], (spawn as { at: [number, number] }).at[1]);
    const validation = validateScene(layout, parsed, (x, y) => grid.walkable(x, y), reachable);
    return { layout, grid, validation, reachable };
  };

  it('defaults to no walls and flat ground so old specs keep parsing', () => {
    const spec = parseSceneSpec({ ...baseSpec });
    expect(spec.water).toBe('river');
    expect(spec.walls.enabled).toBe(false);
    expect(spec.elevation.levels).toBe(0);
  });

  it('fills one edge with sea, a wavy shore and a sand rim', () => {
    const spec = { ...baseSpec, water: 'coast' as const, bounds: { width: 100, height: 88 } };
    const { layout, validation } = walkFromSpawn(spec);

    expect(layout.coastSide).not.toBeNull();
    expect(validation.pass).toBe(true);
    // 海占了可观的一块，但没把整张图淹掉
    expect(validation.metrics.waterRatio).toBeGreaterThan(0.06);
    expect(validation.metrics.waterRatio).toBeLessThan(0.35);

    // 岸线必须起伏：如果所有列的水深都一样，那就是一条直边，不是海岸
    const sea = layout.lots.filter((lot) => lot.kind === 'water');
    expect(sea.length).toBeGreaterThan(0);
    const pressedIntoLand = sea.every((lot) => {
      const side = layout.coastSide as number;
      if (side === 1) return lot.rect.x + lot.rect.w === layout.bounds.width;
      if (side === 3) return lot.rect.x === 0;
      if (side === 0) return lot.rect.y === 0;
      return lot.rect.y + lot.rect.h === layout.bounds.height;
    });
    expect(pressedIntoLand).toBe(true);

    // 没有一栋房子站在海里
    const inSea = layout.buildings.filter((building) =>
      sea.some((lot) =>
        building.rect.x < lot.rect.x + lot.rect.w
        && lot.rect.x < building.rect.x + building.rect.w
        && building.rect.y < lot.rect.y + lot.rect.h
        && lot.rect.y < building.rect.y + building.rect.h));
    expect(inSea).toEqual([]);
    expect(validation.metrics.entranceCoverage).toBe(1);
  });

  it('rings a walled town with gates on every road that crosses it', () => {
    const spec = {
      ...baseSpec,
      kind: 'town' as const,
      bounds: { width: 120, height: 100 },
      walls: { enabled: true, thickness: 1, setback: 3 },
    };
    const { layout, grid, validation } = walkFromSpawn(spec);

    expect(layout.walls.length).toBeGreaterThan(3);
    expect(layout.gates.length).toBeGreaterThan(0);
    expect(validation.issues).toEqual([]);
    expect(validation.metrics.entranceCoverage).toBe(1);

    // 墙不能盖住房子，也不能站在出生点/出口上
    const overlapsWall = layout.buildings.filter((building) =>
      layout.walls.some((wall) =>
        building.rect.x < wall.rect.x + wall.rect.w
        && wall.rect.x < building.rect.x + building.rect.w
        && building.rect.y < wall.rect.y + wall.rect.h
        && wall.rect.y < building.rect.y + building.rect.h));
    expect(overlapsWall).toEqual([]);
    for (const anchor of layout.anchors) {
      expect(grid.walkable(anchor.at[0], anchor.at[1])).toBe(true);
    }
    // 墙内的房子走不到墙外的话，城门就是画上去的
    expect(validation.metrics.reachableCells).toBeGreaterThan(0);
  });

  it('cuts terraces into the map and keeps a ramp wherever a road crosses a cliff', () => {
    const spec = {
      ...baseSpec,
      bounds: { width: 96, height: 104 },
      elevation: { levels: 2, step: 13, from: 'north' as const },
    };
    const { layout, grid, validation } = walkFromSpawn(spec);

    expect(layout.cliffs.length).toBeGreaterThan(4);
    expect(layout.ramps.length).toBeGreaterThan(0);
    expect(layout.terraces.length).toBe(3);
    expect(validation.pass).toBe(true);
    expect(validation.metrics.entranceCoverage).toBe(1);

    // 城市真的分成了高台与低地，而不是全在同一级
    const levels = new Set(layout.buildings.map((building) => building.elevation));
    expect(levels.size).toBeGreaterThan(1);

    // 崖壁不可通行；坡道可通行（否则整座山会被一刀切断）
    for (const cliff of layout.cliffs) {
      for (let y = cliff.rect.y; y < cliff.rect.y + cliff.rect.h; y += 1) {
        for (let x = cliff.rect.x; x < cliff.rect.x + cliff.rect.w; x += 1) {
          expect(grid.walkable(x, y)).toBe(false);
        }
      }
    }
    for (const ramp of layout.ramps) {
      expect(grid.walkable(ramp.rect.x, ramp.rect.y)).toBe(true);
    }
  });

  it('places every required prefab on a cramped terraced map', () => {
    // 这条是真实批次里的 badcase：72×60 上切三级台阶，四条必需建筑，
    // 结果 smithy / tavern 没落地。根因不是放不下，是院落尝试失败时
    // 把队列里的必需项吃掉了（房子没盖，需求也没了）
    const spec = {
      ...baseSpec,
      seed: 1,
      bounds: { width: 72, height: 60 },
      required: ['house-small', 'house-long', 'smithy', 'tavern'],
      water: 'none' as const,
      elevation: { levels: 3, step: 12, from: 'north' as const },
    };
    const { layout, validation, grid } = walkFromSpawn(spec);
    const placed = new Set(layout.buildings.map((building) => building.prefab));
    for (const required of spec.required) expect(placed.has(required)).toBe(true);
    expect(validation.issues).toEqual([]);
    // 门必须落在能站的格子上：台阶地形里房子常紧贴崖壁
    for (const building of layout.buildings) {
      expect(grid.walkable(building.entrance[0], building.entrance[1])).toBe(true);
    }
  });

  it('flags a wall ring that closed itself with no gate', () => {
    const spec = {
      ...baseSpec,
      kind: 'town' as const,
      bounds: { width: 120, height: 100 },
      walls: { enabled: true, thickness: 1, setback: 3 },
    };
    const { layout } = buildScene(parseSceneSpec(spec), kit);
    // 人为把门洞去掉：只剩墙、没有缺口，就是"把玩家关起来"
    const sealed: SceneLayout = { ...layout, gates: [] };
    const validation = validateScene(sealed, parseSceneSpec(spec), () => true, new Set(['0,0']));
    expect(validation.issues.map((issue) => issue.code)).toContain('sealed-walls');
  });

  it('exports wall and cliff collision so the engine agrees with the layout', () => {
    const walled = buildScene(parseSceneSpec({
      ...baseSpec,
      kind: 'town' as const,
      bounds: { width: 120, height: 100 },
      walls: { enabled: true, thickness: 1, setback: 3 },
    }), kit);
    const dir = mkdtempSync(join(tmpdir(), 'gd-walls-'));
    exportGodotScene(walled.layout, dir);
    const tscn = readFileSync(join(dir, 'scene/scene.tscn'), 'utf8');
    // 墙的碰撞体挂在 TownWalls 下；数父节点比自己切字符串稳
    const wallBodies = tscn.match(/parent="TownWalls"/g) ?? [];
    expect(wallBodies.length).toBe(walled.layout.walls.length);
    expect(tscn).toContain('node name="Gates"');
    // 门洞必须是 Marker2D：门是"能过去的地方"，碰撞交给导航
    expect((tscn.match(/parent="Gates"/g) ?? []).length).toBe(walled.layout.gates.length);

    const terraced = buildScene(parseSceneSpec({
      ...baseSpec,
      bounds: { width: 96, height: 104 },
      elevation: { levels: 2, step: 13, from: 'north' as const },
    }), kit);
    const cliffDir = mkdtempSync(join(tmpdir(), 'gd-cliffs-'));
    exportGodotScene(terraced.layout, cliffDir);
    const cliffTscn = readFileSync(join(cliffDir, 'scene/scene.tscn'), 'utf8');
    expect((cliffTscn.match(/parent="Cliffs"/g) ?? []).length).toBe(terraced.layout.cliffs.length);
  });
});

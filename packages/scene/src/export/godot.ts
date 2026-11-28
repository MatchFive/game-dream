import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Kit, SceneLayout } from '../schema.js';
import { findBuiltinKit } from '../kits.js';
import { instanceNodes, prefabScene, type PrefabArt, type PrefabSpec } from './prefabs.js';
import { buildTileLayers, encodeTileMapData, renderLightTexture, renderTileAtlas, tileSetResource } from './tiles.js';

export interface GodotExportResult {
  dir: string;
  files: string[];
  /** 导出摘要，写进 trace 的 export 步骤 */
  summary: Record<string, unknown>;
}

export interface GodotExportOptions {
  /** 给出 kit 时按 kit 的 prefab.nodes 挂节点；不给就按 layout.kitId 找内置套件 */
  kit?: Kit;
  /** 美术素材目录，约定为 <artDir>/<kitId>/<prefabId>.png；给了就用贴图代替色块 */
  artDir?: string;
  /**
   * tile：贴图铺满 footprint（正俯视屋顶图）
   * billboard：贴图等宽、底边对齐 footprint 底边、向上溢出（带立面的 3/4 视图，RPG 常见）
   */
  artStyle?: 'tile' | 'billboard';
}

/** kit 里某个 prefab 挂了几种节点——摘要与自检都用它当期望值。 */
function kitNodeCount(
  nodes: Map<string, Array<{ type: string }>>,
  prefabId: string,
  type: string,
): number {
  return (nodes.get(prefabId) ?? []).filter((node) => node.type === type).length;
}

/** 读 PNG 的 IHDR 得到尺寸，避免再引一个解码库。 */
function pngSize(file: string): { width: number; height: number } | null {
  try {
    const buffer = readFileSync(file);
    if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  } catch {
    return null;
  }
}

interface NavMesh {
  vertices: Array<[number, number]>;
  polygons: number[][];
}

/**
 * 从可行走格生成导航网格：每个可走格一个四边形，顶点按整数坐标去重。
 * 去重是关键——相邻多边形必须共享完全相同的顶点，导航服务器才会把它们连起来。
 */
function buildNavMesh(layout: SceneLayout): NavMesh {
  const blocked = new Set<string>();
  const blockRect = (rect: { x: number; y: number; w: number; h: number }) => {
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) blocked.add(`${x},${y}`);
    }
  };
  for (const building of layout.buildings) blockRect(building.rect);
  for (const lot of layout.lots) {
    if (lot.kind === 'water') blockRect(lot.rect);
  }
  // 城墙与崖壁：走不过去的东西必须在导航网格里也走不过去，
  // 否则寻路会"穿墙"直达门口，自检还全是绿的——最坏的那种假通过。
  for (const segment of layout.walls) blockRect(segment.rect);
  for (const cliff of layout.cliffs) blockRect(cliff.rect);
  // 坡道是崖上的路，本来就没被记成崖；万一两者重叠也以坡道为准
  for (const ramp of layout.ramps) {
    for (let y = ramp.rect.y; y < ramp.rect.y + ramp.rect.h; y += 1) {
      for (let x = ramp.rect.x; x < ramp.rect.x + ramp.rect.w; x += 1) blocked.delete(`${x},${y}`);
    }
  }

  const size = layout.tileSize;
  const vertices: Array<[number, number]> = [];
  const index = new Map<string, number>();
  const vertexId = (x: number, y: number): number => {
    const key = `${x},${y}`;
    const existing = index.get(key);
    if (existing !== undefined) return existing;
    const id = vertices.length;
    vertices.push([x * size, y * size]);
    index.set(key, id);
    return id;
  };

  const polygons: number[][] = [];
  for (let y = 0; y < layout.bounds.height; y += 1) {
    for (let x = 0; x < layout.bounds.width; x += 1) {
      if (blocked.has(`${x},${y}`)) continue;
      polygons.push([vertexId(x, y), vertexId(x + 1, y), vertexId(x + 1, y + 1), vertexId(x, y + 1)]);
    }
  }
  return { vertices, polygons };
}

const CHECK_SCRIPT = [
  'extends Node2D',
  '',
  '## 由 GameDream 场景导出器生成：自检节点结构、瓦片层、导航可达性，然后退出。',
  'func _ready() -> void:',
  '\tvar buildings := get_node("Buildings").get_child_count()',
  '\tvar shapes := 0',
  '\tvar entrances := 0',
  '\tvar floors := 0',
  '\tvar lights := 0',
  '\tvar zones := 0',
  '\tvar markers := 0',
  '\tfor child in get_node("Buildings").get_children():',
  '\t\tfloors += int(child.get_meta("floors", 0))',
  '\t\tfor sub in child.get_children():',
  '\t\t\tif sub is CollisionShape2D:',
  '\t\t\t\tshapes += 1',
  '\t\t\telif sub is Marker2D:',
  '\t\t\t\t# Entrance 是导出器加的正门；其余 Marker 是 kit 挂在 prefab 上的路点',
  '\t\t\t\tif sub.name == "Entrance":',
  '\t\t\t\t\tentrances += 1',
  '\t\t\t\telse:',
  '\t\t\t\t\tmarkers += 1',
  '\t\t\telif sub is PointLight2D:',
  '\t\t\t\tlights += 1',
  '\t\t\telif sub is Area2D:',
  '\t\t\t\tzones += 1',
  '\tvar anchors := get_node("Anchors").get_child_count()',
  '\tprint("GAMEDREAM_SCENE_BUILDINGS=%d" % buildings)',
  '\tprint("GAMEDREAM_SCENE_SHAPES=%d" % shapes)',
  '\tprint("GAMEDREAM_SCENE_ENTRANCES=%d" % entrances)',
  '\tprint("GAMEDREAM_SCENE_ANCHORS=%d" % anchors)',
  '\tprint("GAMEDREAM_SCENE_FLOORS=%d" % floors)',
  '\tprint("GAMEDREAM_SCENE_LIGHTS=%d" % lights)',
  '\tprint("GAMEDREAM_SCENE_ZONES=%d" % zones)',
  '\tprint("GAMEDREAM_SCENE_MARKERS=%d" % markers)',
  '',
  '\tvar town_walls := get_node_or_null("TownWalls")',
  '\tvar cliffs := get_node_or_null("Cliffs")',
  '\tprint("GAMEDREAM_SCENE_WALLS=%d" % (town_walls.get_child_count() if town_walls else 0))',
  '\tprint("GAMEDREAM_SCENE_CLIFFS=%d" % (cliffs.get_child_count() if cliffs else 0))',
  '',
  '\tvar ground := get_node_or_null("Ground") as TileMapLayer',
  '\tvar roads := get_node_or_null("Roads") as TileMapLayer',
  '\tvar props := get_node_or_null("Props") as TileMapLayer',
  '\tif ground == null or roads == null:',
  '\t\tprint("GAMEDREAM_TILES_MISSING=1")',
  '\telse:',
  '\t\tprint("GAMEDREAM_TILES_GROUND=%d" % ground.get_used_cells().size())',
  '\t\tprint("GAMEDREAM_TILES_ROADS=%d" % roads.get_used_cells().size())',
  '\t\tprint("GAMEDREAM_TILES_PROPS=%d" % (props.get_used_cells().size() if props else 0))',
  '\t\tprint("GAMEDREAM_TILES_ATLAS=%s" % str(ground.tile_set != null))',
  '',
  '\tvar spawn_node := get_node_or_null("Anchors/Spawn0") as Marker2D',
  '\tif spawn_node:',
  '\t\tprint("GAMEDREAM_SCENE_SPAWN=%d,%d" % [int(spawn_node.position.x), int(spawn_node.position.y)])',
  '',
  '\tvar region := get_node_or_null("Navigation") as NavigationRegion2D',
  '\tif region == null:',
  '\t\tprint("GAMEDREAM_NAV_MISSING=1")',
  '\telse:',
  '\t\tvar map: RID = region.get_navigation_map()',
  '\t\t# 导航地图是异步构建的：先等几帧完成首次同步（否则第一条查询会报 map not synchronized），',
  '\t\t# 再轮询到出生点真的落在网格上，然后才测路径',
  '\t\tfor _i in range(3):',
  '\t\t\tawait get_tree().physics_frame',
  '\t\tNavigationServer2D.map_force_update(map)',
  '\t\tfor _i in range(40):',
  '\t\t\tawait get_tree().physics_frame',
  '\t\t\tNavigationServer2D.map_force_update(map)',
  '\t\t\tif NavigationServer2D.map_get_closest_point(map, spawn_node.global_position) != Vector2.ZERO:',
  '\t\t\t\tbreak',
  '\t\tvar total := 0',
  '\t\tvar reached := 0',
  '\t\tvar failed: Array[String] = []',
  '\t\tfor child in get_node("Buildings").get_children():',
  '\t\t\tvar entrance := child.get_node_or_null("Entrance") as Marker2D',
  '\t\t\tif entrance == null or spawn_node == null:',
  '\t\t\t\tcontinue',
  '\t\t\ttotal += 1',
  '\t\t\tvar path := NavigationServer2D.map_get_path(map, spawn_node.global_position, entrance.global_position, true)',
  '\t\t\tif path.size() > 0 and path[path.size() - 1].distance_to(entrance.global_position) < 2.0:',
  '\t\t\t\treached += 1',
  '\t\t\telse:',
  '\t\t\t\tfailed.append(String(child.name))',
  '\t\tprint("GAMEDREAM_NAV_TOTAL=%d" % total)',
  '\t\tprint("GAMEDREAM_NAV_REACHED=%d" % reached)',
  '\t\tif failed.size() > 0:',
  '\t\t\tprint("GAMEDREAM_NAV_FAILED=%s" % ",".join(failed))',
  '',
  '\tprint("GAMEDREAM_SCENE_OK=1")',
  '\tget_tree().quit()',
  '',
].join('\n');

/**
 * 导出成可直接用 Godot 4.4 打开的项目：
 * - 地面是两张 TileMapLayer（地形 / 道路），可在编辑器里逐格刷改
 * - 建筑是 `prefabs/*.tscn` 的实例，改 prefab 一次全图生效
 * - 导航与边界墙照旧
 */
export function exportGodotScene(
  layout: SceneLayout,
  outDir: string,
  options: GodotExportOptions = {},
): GodotExportResult {
  const sceneDir = join(outDir, 'scene');
  const prefabDir = join(outDir, 'prefabs');
  mkdirSync(sceneDir, { recursive: true });
  mkdirSync(prefabDir, { recursive: true });

  const size = layout.tileSize;
  const bounds = layout.bounds;

  writeFileSync(join(sceneDir, 'layout.json'), `${JSON.stringify(layout, null, 2)}\n`, 'utf8');

  // 1. 瓦片：atlas + TileSet 资源
  const atlas = renderTileAtlas(layout);
  writeFileSync(join(sceneDir, 'tiles.png'), atlas.png);
  writeFileSync(join(sceneDir, 'tiles.tres'), tileSetResource(layout, atlas), 'utf8');
  const layers = buildTileLayers(layout, atlas);

  // 2. 建筑贴图：约定 <artDir>/<kitId>/<prefab>.png
  const artDir = options.artDir ? join(options.artDir, layout.kitId) : undefined;
  const artTextures = new Map<string, PrefabArt>();
  if (artDir && existsSync(artDir)) {
    const artOutDir = join(sceneDir, 'art');
    mkdirSync(artOutDir, { recursive: true });
    for (const prefab of new Set(layout.buildings.map((building) => building.prefab))) {
      const source = join(artDir, `${prefab}.png`);
      if (!existsSync(source)) continue;
      const png = pngSize(source);
      if (!png) continue;
      copyFileSync(source, join(artOutDir, `${prefab}.png`));
      artTextures.set(prefab, { res: `res://scene/art/${prefab}.png`, width: png.width, height: png.height });
    }
  }

  // 3. prefab：每种 kit 建筑一个，场景里只放实例。
  //    prefab 上挂什么节点来自 kit（门口一盏灯、一块交互区），不是写死在导出器里。
  const kit = options.kit ?? findBuiltinKit(layout.kitId);
  const kitNodes = new Map((kit?.prefabs ?? []).map((prefab) => [prefab.id, prefab.nodes ?? []]));

  // 灯光贴图：只要有一个用到的 prefab 挂了灯就写一张，prefab 与场景共用同一张
  const usedPrefabs = new Set(layout.buildings.map((building) => building.prefab));
  const usesLights = [...usedPrefabs].some((id) => (kitNodes.get(id) ?? []).some((node) => node.type === 'light'));
  let lightTexture: string | undefined;
  if (usesLights) {
    writeFileSync(join(sceneDir, 'light.png'), renderLightTexture());
    lightTexture = 'res://scene/light.png';
  }

  const prefabSpecs = new Map<string, PrefabSpec>();
  for (const building of layout.buildings) {
    if (prefabSpecs.has(building.prefab)) continue;
    prefabSpecs.set(building.prefab, {
      id: building.prefab,
      color: building.color,
      roof: building.roof,
      art: artTextures.get(building.prefab),
      nodes: kitNodes.get(building.prefab) ?? [],
      lightTexture,
    });
  }
  const prefabFiles: string[] = [];
  for (const spec of prefabSpecs.values()) {
    writeFileSync(join(prefabDir, `${spec.id}.tscn`), prefabScene(spec, size), 'utf8');
    prefabFiles.push(`prefabs/${spec.id}.tscn`);
  }

  // 4. 碰撞形状：尺寸相同的建筑共用一个
  const shapes: Array<{ id: string; w: number; h: number }> = [];
  const shapeIdFor = (w: number, h: number): string => {
    const existing = shapes.find((entry) => entry.w === w && entry.h === h);
    if (existing) return existing.id;
    const entry = { id: `shape_${shapes.length}`, w, h };
    shapes.push(entry);
    return entry.id;
  };
  const buildingShapeIds = layout.buildings.map((building) =>
    shapeIdFor(building.rect.w * size, building.rect.h * size));
  const boundary: Array<{ name: string; x: number; y: number; w: number; h: number }> = [
    { name: 'top', x: 0, y: -size / 2, w: bounds.width * size, h: size },
    { name: 'bottom', x: 0, y: bounds.height * size - size / 2, w: bounds.width * size, h: size },
    { name: 'left', x: -size / 2, y: 0, w: size, h: bounds.height * size },
    { name: 'right', x: bounds.width * size - size / 2, y: 0, w: size, h: bounds.height * size },
  ];
  const wallShapeIds = boundary.map((wall) => shapeIdFor(wall.w, wall.h));

  // 城墙与崖壁是"真的挡路"：导出的碰撞体必须和导航网格一致，
  // 不然玩家在城里走会和看不见的墙打架（或直接穿墙）。
  const townWallShapeIds = layout.walls.map((segment) =>
    shapeIdFor(segment.rect.w * size, segment.rect.h * size));
  const cliffShapeIds = layout.cliffs.map((cliff) =>
    shapeIdFor(cliff.rect.w * size, cliff.rect.h * size));

  const navMesh = buildNavMesh(layout);
  const navResource = navMesh.polygons.length > 0
    ? [
      '[sub_resource type="NavigationPolygon" id="nav_mesh"]',
      `vertices = PackedVector2Array(${navMesh.vertices.map(([x, y]) => `${x}, ${y}`).join(', ')})`,
      `polygons = [${navMesh.polygons.map((polygon) => `PackedInt32Array(${polygon.join(', ')})`).join(', ')}]`,
    ].join('\n')
    : null;

  // 5. 场景文件
  const extResources = [
    '[ext_resource type="Script" path="res://scene/scene_check.gd" id="1_script"]',
    '[ext_resource type="TileSet" path="res://scene/tiles.tres" id="2_tileset"]',
    ...[...prefabSpecs.keys()].map(
      (id) => `[ext_resource type="PackedScene" path="res://prefabs/${id}.tscn" id="prefab_${id}"]`,
    ),
  ];
  const subResources = shapes.map(
    (shape) => `[sub_resource type="RectangleShape2D" id="${shape.id}"]\nsize = Vector2(${shape.w}, ${shape.h})`,
  );
  if (navResource) subResources.push(navResource);

  const lines: string[] = [];
  lines.push(`[gd_scene load_steps=${extResources.length + subResources.length + 1} format=3]`);
  lines.push('');
  lines.push(...extResources);
  lines.push('');
  if (subResources.length > 0) {
    lines.push(...subResources);
    lines.push('');
  }

  lines.push('[node name="Scene" type="Node2D"]');
  lines.push('script = ExtResource("1_script")');
  lines.push('');

  // 地面：地形一层，道路一层。两层分开，改路面时不用碰地形
  lines.push('[node name="Ground" type="TileMapLayer" parent="."]');
  lines.push(`tile_map_data = ${encodeTileMapData(layers.ground)}`);
  lines.push('tile_set = ExtResource("2_tileset")');
  lines.push('');
  lines.push('[node name="Roads" type="TileMapLayer" parent="."]');
  lines.push(`tile_map_data = ${encodeTileMapData(layers.roads)}`);
  lines.push('tile_set = ExtResource("2_tileset")');
  lines.push('');
  // 道具层放在地形与道路之后：TileMapLayer 按节点顺序叠，树/灯/井要压在地面上
  if (layers.props.length > 0) {
    lines.push('[node name="Props" type="TileMapLayer" parent="."]');
    lines.push(`tile_map_data = ${encodeTileMapData(layers.props)}`);
    lines.push('tile_set = ExtResource("2_tileset")');
    lines.push('');
  }

  if (navResource) {
    lines.push('[node name="Navigation" type="NavigationRegion2D" parent="."]');
    lines.push('navigation_polygon = SubResource("nav_mesh")');
    lines.push('');
  }
  lines.push('[node name="Walls" type="StaticBody2D" parent="."]');
  lines.push('');
  // 没有城墙/崖壁的场景不生成空节点：空 StaticBody2D 会让"这套工程有几个碰撞体"
  // 这类自检指标失真
  if (layout.walls.length > 0) {
    lines.push('[node name="TownWalls" type="StaticBody2D" parent="."]');
    lines.push('');
  }
  if (layout.cliffs.length > 0) {
    lines.push('[node name="Cliffs" type="StaticBody2D" parent="."]');
    lines.push('');
  }
  if (layout.gates.length > 0) {
    lines.push('[node name="Gates" type="Node2D" parent="."]');
    lines.push('');
  }
  lines.push('[node name="Buildings" type="Node2D" parent="."]');
  lines.push('');
  lines.push('[node name="Anchors" type="Node2D" parent="."]');
  lines.push('');

  boundary.forEach((wall, index) => {
    lines.push(`[node name="${wall.name}" type="CollisionShape2D" parent="Walls"]`);
    lines.push(`position = Vector2(${wall.x + wall.w / 2}, ${wall.y + wall.h / 2})`);
    lines.push(`shape = SubResource("${wallShapeIds[index]}")`);
    lines.push('');
  });

  layout.walls.forEach((segment, index) => {
    const rect = segment.rect;
    lines.push(`[node name="${segment.id}" type="CollisionShape2D" parent="TownWalls"]`);
    lines.push(`position = Vector2(${rect.x * size + (rect.w * size) / 2}, ${rect.y * size + (rect.h * size) / 2})`);
    lines.push(`shape = SubResource("${townWallShapeIds[index]}")`);
    lines.push('');
  });

  layout.cliffs.forEach((cliff, index) => {
    const rect = cliff.rect;
    lines.push(`[node name="${cliff.id}" type="CollisionShape2D" parent="Cliffs"]`);
    lines.push(`position = Vector2(${rect.x * size + (rect.w * size) / 2}, ${rect.y * size + (rect.h * size) / 2})`);
    lines.push(`shape = SubResource("${cliffShapeIds[index]}")`);
    lines.push('');
  });

  // 城门：留成 Marker2D 而不是实体——门是"可以过去的地方"，判断交给导航
  layout.gates.forEach((gate) => {
    lines.push(`[node name="${gate.id}" type="Marker2D" parent="Gates"]`);
    lines.push(`position = Vector2(${gate.at[0] * size + size / 2}, ${gate.at[1] * size + size / 2})`);
    lines.push('');
  });

  // 按底边排序，靠下的盖住靠上的（billboard 溢出时尤其重要）
  const drawOrder = [...layout.buildings].sort((a, b) => (a.rect.y + a.rect.h) - (b.rect.y + b.rect.h));
  drawOrder.forEach((building) => {
    const index = layout.buildings.indexOf(building);
    const px = building.rect.x * size;
    const py = building.rect.y * size;
    const spec = prefabSpecs.get(building.prefab) as PrefabSpec;
    lines.push(...instanceNodes(
      {
        name: building.id,
        prefabId: building.prefab,
        x: px,
        y: py,
        w: building.rect.w * size,
        h: building.rect.h * size,
        entrance: [
          building.entrance[0] * size - px + size / 2,
          building.entrance[1] * size - py + size / 2,
        ],
        shapeId: buildingShapeIds[index],
        billboard: options.artStyle === 'billboard',
        // 高台上的房子要压住低处的房子，否则叠放顺序只看底边，会盖错。
        // 楼层不进 z_index：那会让"下面的高楼"盖住"上面的矮楼"，billboard 会穿帮
        zIndex: building.elevation * 10,
        floors: building.floors,
      },
      spec,
    ));
  });

  const anchorNames: Record<string, string> = { spawn: 'Spawn', exit: 'Exit', poi: 'Poi' };
  layout.anchors.forEach((anchor, index) => {
    lines.push(`[node name="${anchorNames[anchor.kind] ?? 'Anchor'}${index}" type="Marker2D" parent="Anchors"]`);
    lines.push(`position = Vector2(${anchor.at[0] * size + size / 2}, ${anchor.at[1] * size + size / 2})`);
    lines.push('');
  });

  writeFileSync(join(sceneDir, 'scene.tscn'), lines.join('\n'), 'utf8');

  writeFileSync(
    join(outDir, 'project.godot'),
    [
      'config_version=5',
      '',
      '[application]',
      `config/name="${layout.name}"`,
      'run/main_scene="res://scene/scene.tscn"',
      'config/features=PackedStringArray("4.4", "GL Compatibility")',
      '',
      '[rendering]',
      'renderer/rendering_method="gl_compatibility"',
      'renderer/rendering_method.mobile="gl_compatibility"',
      '',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(join(sceneDir, 'scene_check.gd'), CHECK_SCRIPT, 'utf8');

  return {
    dir: outDir,
    files: [
      'project.godot',
      'scene/scene.tscn',
      'scene/tiles.png',
      'scene/tiles.tres',
      'scene/scene_check.gd',
      'scene/layout.json',
      ...prefabFiles,
      ...[...artTextures.keys()].map((id) => `scene/art/${id}.png`),
      ...(lightTexture ? ['scene/light.png'] : []),
    ],
    summary: {
      buildings: layout.buildings.length,
      prefabs: prefabSpecs.size,
      collisions: shapes.length,
      anchors: layout.anchors.length,
      ground: `${bounds.width}x${bounds.height}`,
      textures: artTextures.size,
      walls: layout.walls.length,
      gates: layout.gates.length,
      cliffs: layout.cliffs.length,
      ramps: layout.ramps.length,
      terraces: layout.terraces.length,
      coastSide: layout.coastSide,
      prefabNodes: {
        lights: layout.buildings.reduce((sum, building) => sum + (kitNodeCount(kitNodes, building.prefab, 'light')), 0),
        zones: layout.buildings.reduce((sum, building) => sum + (kitNodeCount(kitNodes, building.prefab, 'area')), 0),
        markers: layout.buildings.reduce((sum, building) => sum + (kitNodeCount(kitNodes, building.prefab, 'marker')), 0),
      },
      floors: {
        mean: layout.buildings.length === 0
          ? 0
          : Number((layout.buildings.reduce((sum, b) => sum + b.floors, 0) / layout.buildings.length).toFixed(2)),
        max: layout.buildings.reduce((max, b) => Math.max(max, b.floors), 0),
      },
      tiles: {
        cells: layers.ground.length,
        roadCells: layers.roads.length,
        propCells: layers.props.length,
        byTerrain: layers.counts,
      },
      tileAtlas: `${atlas.total} tiles @ ${atlas.tileSize}px`,
      navPolygons: navMesh.polygons.length,
      navVertices: navMesh.vertices.length,
    },
  };
}

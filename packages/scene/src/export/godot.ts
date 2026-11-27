import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from '@gamedream/core';
import type { SceneLayout } from '../schema.js';

export interface GodotExportResult {
  dir: string;
  files: string[];
  /** 导出摘要，写进 trace 的 export 步骤 */
  summary: Record<string, unknown>;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
};

const colorLiteral = (hex: string, alpha = 1): string => {
  const [r, g, b] = hexToRgb(hex);
  return `Color(${(r / 255).toFixed(4)}, ${(g / 255).toFixed(4)}, ${(b / 255).toFixed(4)}, ${alpha})`;
};

/** 把场景栅格化成一张地面底图：地块填色 + 道路描粗。 */
function renderGround(layout: SceneLayout): Buffer {
  const size = layout.tileSize;
  const width = layout.bounds.width * size;
  const height = layout.bounds.height * size;
  const rgba = Buffer.alloc(width * height * 4);

  const paint = (x: number, y: number, hex: string) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const [r, g, b] = hexToRgb(hex);
    const offset = (y * width + x) * 4;
    rgba[offset] = r;
    rgba[offset + 1] = g;
    rgba[offset + 2] = b;
    rgba[offset + 3] = 255;
  };
  const fillRect = (x: number, y: number, w: number, h: number, hex: string) => {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) paint(col, row, hex);
    }
  };

  fillRect(0, 0, width, height, layout.palette.ground);
  for (const lot of layout.lots) {
    const color = lot.kind === 'plaza'
      ? layout.palette.plaza
      : lot.kind === 'green'
        ? layout.palette.green
        : lot.kind === 'water'
          ? layout.palette.water
          : null;
    if (color) fillRect(lot.rect.x * size, lot.rect.y * size, lot.rect.w * size, lot.rect.h * size, color);
  }
  for (const road of layout.roads) {
    for (let i = 1; i < road.points.length; i += 1) {
      const [x1, y1] = road.points[i - 1];
      const [x2, y2] = road.points[i];
      if (x1 === x2) {
        const left = x1 - Math.floor((road.width - 1) / 2);
        fillRect(left * size, Math.min(y1, y2) * size, road.width * size, (Math.abs(y2 - y1) + 1) * size, layout.palette.road);
      } else {
        const top = y1 - Math.floor((road.width - 1) / 2);
        fillRect(Math.min(x1, x2) * size, top * size, (Math.abs(x2 - x1) + 1) * size, road.width * size, layout.palette.road);
      }
    }
  }
  return encodePng(width, height, rgba);
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
  for (const building of layout.buildings) {
    for (let y = building.rect.y; y < building.rect.y + building.rect.h; y += 1) {
      for (let x = building.rect.x; x < building.rect.x + building.rect.w; x += 1) blocked.add(`${x},${y}`);
    }
  }
  for (const lot of layout.lots) {
    if (lot.kind !== 'water') continue;
    for (let y = lot.rect.y; y < lot.rect.y + lot.rect.h; y += 1) {
      for (let x = lot.rect.x; x < lot.rect.x + lot.rect.w; x += 1) blocked.add(`${x},${y}`);
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

interface ShapeEntry {
  id: string;
  w: number;
  h: number;
}

/**
 * 导出成可直接用 Godot 4.4 打开的项目：
 * 地面是一张底图，建筑是带碰撞的 StaticBody2D，锚点是 Marker2D。
 * 节点数量与布局一一对应，便于在引擎里逐项核对。
 */
export function exportGodotScene(layout: SceneLayout, outDir: string): GodotExportResult {
  const sceneDir = join(outDir, 'scene');
  mkdirSync(sceneDir, { recursive: true });

  const png = renderGround(layout);
  writeFileSync(join(sceneDir, 'ground.png'), png);
  writeFileSync(join(sceneDir, 'layout.json'), `${JSON.stringify(layout, null, 2)}\n`, 'utf8');

  // 尺寸相同的建筑共用一个矩形碰撞体
  const shapes: ShapeEntry[] = [];
  const shapeIdFor = (w: number, h: number): string => {
    const existing = shapes.find((entry) => entry.w === w && entry.h === h);
    if (existing) return existing.id;
    const entry = { id: `shape_${shapes.length}`, w, h };
    shapes.push(entry);
    return entry.id;
  };
  const buildingShapeIds = layout.buildings.map((building) => shapeIdFor(building.rect.w * layout.tileSize, building.rect.h * layout.tileSize));
  // 边界墙也占 sub_resource，必须在写 header 之前登记，load_steps 才不会偏小
  const size = layout.tileSize;
  const bounds = layout.bounds;
  const walls: Array<{ name: string; x: number; y: number; w: number; h: number }> = [
    { name: 'top', x: 0, y: -size / 2, w: bounds.width * size, h: size },
    { name: 'bottom', x: 0, y: bounds.height * size - size / 2, w: bounds.width * size, h: size },
    { name: 'left', x: -size / 2, y: 0, w: size, h: bounds.height * size },
    { name: 'right', x: bounds.width * size - size / 2, y: 0, w: size, h: bounds.height * size },
  ];
  const wallShapeIds = walls.map((wall) => shapeIdFor(wall.w, wall.h));

  const navMesh = buildNavMesh(layout);
  const navResource = navMesh.polygons.length > 0
    ? [
      `[sub_resource type="NavigationPolygon" id="nav_mesh"]`,
      `vertices = PackedVector2Array(${navMesh.vertices.map(([x, y]) => `${x}, ${y}`).join(', ')})`,
      `polygons = [${navMesh.polygons.map((polygon) => `PackedInt32Array(${polygon.join(', ')})`).join(', ')}]`,
    ].join('\n')
    : null;

  const extResources = [
    '[ext_resource type="Script" path="res://scene/scene_check.gd" id="1_script"]',
    '[ext_resource type="Texture2D" path="res://scene/ground.png" id="2_ground"]',
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
  lines.push('[node name="Ground" type="Sprite2D" parent="."]');
  lines.push('texture = ExtResource("2_ground")');
  lines.push('');
  if (navResource) {
    lines.push('[node name="Navigation" type="NavigationRegion2D" parent="."]');
    lines.push('navigation_polygon = SubResource("nav_mesh")');
    lines.push('');
  }
  lines.push('[node name="Walls" type="StaticBody2D" parent="."]');
  lines.push('');
  lines.push('[node name="Buildings" type="Node2D" parent="."]');
  lines.push('');
  lines.push('[node name="Anchors" type="Node2D" parent="."]');
  lines.push('');

  // 地图边界墙：4 个碰撞体，防止角色走出场景
  walls.forEach((wall, index) => {
    const shapeId = wallShapeIds[index];
    lines.push(`[node name="${wall.name}" type="CollisionShape2D" parent="Walls"]`);
    lines.push(`position = Vector2(${wall.x + wall.w / 2}, ${wall.y + wall.h / 2})`);
    lines.push(`shape = SubResource("${shapeId}")`);
    lines.push('');
  });

  layout.buildings.forEach((building, index) => {
    const px = building.rect.x * size;
    const py = building.rect.y * size;
    const w = building.rect.w * size;
    const h = building.rect.h * size;
    lines.push(`[node name="${building.id}" type="StaticBody2D" parent="Buildings"]`);
    lines.push(`position = Vector2(${px}, ${py})`);
    lines.push('');
    lines.push(`[node name="Roof" type="Polygon2D" parent="Buildings/${building.id}"]`);
    lines.push(`color = ${colorLiteral(building.color)}`);
    lines.push(`polygon = PackedVector2Array(0, 0, ${w}, 0, ${w}, ${h}, 0, ${h})`);
    lines.push('');
    lines.push(`[node name="Outline" type="Line2D" parent="Buildings/${building.id}"]`);
    lines.push(`points = PackedVector2Array(0, 0, ${w}, 0, ${w}, ${h}, 0, ${h}, 0, 0)`);
    lines.push(`width = 2.0`);
    lines.push(`default_color = ${colorLiteral('#4a3f33')}`);
    lines.push('');
    lines.push(`[node name="Body" type="CollisionShape2D" parent="Buildings/${building.id}"]`);
    lines.push(`position = Vector2(${w / 2}, ${h / 2})`);
    lines.push(`shape = SubResource("${buildingShapeIds[index]}")`);
    lines.push('');
    lines.push(`[node name="Entrance" type="Marker2D" parent="Buildings/${building.id}"]`);
    lines.push(
      `position = Vector2(${(building.entrance[0] * size) - px + size / 2}, ${(building.entrance[1] * size) - py + size / 2})`,
    );
    lines.push('');
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

  writeFileSync(
    join(sceneDir, 'scene_check.gd'),
    [
      'extends Node2D',
      '',
      '## 由 GameDream 场景导出器生成：自检节点结构、导航可达性，然后退出。',
      'func _ready() -> void:',
      '\tvar buildings := get_node("Buildings").get_child_count()',
      '\tvar shapes := 0',
      '\tvar entrances := 0',
      '\tfor child in get_node("Buildings").get_children():',
      '\t\tfor sub in child.get_children():',
      '\t\t\tif sub is CollisionShape2D:',
      '\t\t\t\tshapes += 1',
      '\t\t\telif sub is Marker2D:',
      '\t\t\t\tentrances += 1',
      '\tvar anchors := get_node("Anchors").get_child_count()',
      '\tprint("GAMEDREAM_SCENE_BUILDINGS=%d" % buildings)',
      '\tprint("GAMEDREAM_SCENE_SHAPES=%d" % shapes)',
      '\tprint("GAMEDREAM_SCENE_ENTRANCES=%d" % entrances)',
      '\tprint("GAMEDREAM_SCENE_ANCHORS=%d" % anchors)',
      '\tvar spawn_node := get_node_or_null("Anchors/Spawn0") as Marker2D',
      '\tif spawn_node:',
      '\t\tprint("GAMEDREAM_SCENE_SPAWN=%d,%d" % [int(spawn_node.position.x), int(spawn_node.position.y)])',
      '',
      '\tvar region := get_node_or_null("Navigation") as NavigationRegion2D',
      '\tif region == null:',
      '\t\tprint("GAMEDREAM_NAV_MISSING=1")',
      '\telse:',
      '\t\tvar map: RID = region.get_navigation_map()',
      '\t\t# 导航地图是异步构建的：轮询到出生点落在网格上再开始测路径',
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
    ].join('\n'),
    'utf8',
  );

  return {
    dir: outDir,
    files: ['project.godot', 'scene/scene.tscn', 'scene/ground.png', 'scene/scene_check.gd', 'scene/layout.json'],
    summary: {
      buildings: layout.buildings.length,
      collisions: shapes.length,
      anchors: layout.anchors.length,
      ground: `${layout.bounds.width * size}x${layout.bounds.height * size}`,
      navPolygons: navMesh.polygons.length,
      navVertices: navMesh.vertices.length,
    },
  };
}

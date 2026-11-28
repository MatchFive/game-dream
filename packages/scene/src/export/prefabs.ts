/**
 * 建筑预制体（prefab）。
 *
 * 导出器不再把每栋建筑平铺成一堆 StaticBody2D + Sprite2D，而是每种 kit 建筑
 * 生成一个 `.tscn`，场景里只放实例。这样"改一次 prefab，整张图都跟着变"——
 * 换贴图、加灯光、加招牌都在一个文件里做完。
 *
 * 约定：prefab 以"左上角为原点、1 格大小"为默认尺寸；实例负责把这些默认值
 * 覆盖成实际 footprint：
 *
 *   [node name="Art" parent="Buildings/b-3" index="0"]   ← 贴图位置与缩放
 *   [node name="Body" parent="Buildings/b-3" index="1"]  ← 碰撞体尺寸
 *   [node name="Entrance" type="Marker2D" parent="Buildings/b-3"]  ← 正门（新增子节点）
 */

export interface PrefabArt {
  /** res:// 路径 */
  res: string;
  width: number;
  height: number;
}

export interface PrefabSpec {
  id: string;
  color: string;
  roof: string;
  art?: PrefabArt;
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

/** 生成一个 prefab 的场景文件内容。 */
export function prefabScene(spec: PrefabSpec, tileSize: number): string {
  const ext = spec.art
    ? [`[ext_resource type="Texture2D" path="${spec.art.res}" id="1_art"]`]
    : [];
  const sub = [
    '[sub_resource type="RectangleShape2D" id="body"]',
    `size = Vector2(${tileSize}, ${tileSize})`,
  ];

  const lines: string[] = [];
  lines.push(`[gd_scene load_steps=${ext.length + sub.length + 1} format=3]`, '');
  if (ext.length > 0) {
    lines.push(...ext, '');
  }
  lines.push(...sub, '');

  // 根节点就是碰撞体：实例只需覆盖尺寸，不需要额外的 StaticBody2D
  lines.push(`[node name="${spec.id}" type="StaticBody2D"]`, '');

  if (spec.art) {
    lines.push('[node name="Art" type="Sprite2D" parent="."]');
    lines.push('centered = false');
    lines.push(`offset = Vector2(${-tileSize / 2}, ${-tileSize})`);
    lines.push('texture = ExtResource("1_art")');
  } else {
    // 没有美术资源时保留一块单位方块：实例用 scale 拉到 footprint 大小
    lines.push('[node name="Art" type="Polygon2D" parent="."]');
    lines.push(`color = ${colorLiteral(spec.color)}`);
    lines.push('polygon = PackedVector2Array(0, 0, 1, 0, 1, 1, 0, 1)');
  }
  lines.push('');
  lines.push('[node name="Body" type="CollisionShape2D" parent="."]');
  lines.push('shape = SubResource("body")');
  return `${lines.join('\n')}\n`;
}

export interface InstancePlacement {
  /** 场景里的节点名（building-3 之类） */
  name: string;
  prefabId: string;
  /** footprint 左上角，像素 */
  x: number;
  y: number;
  /** footprint 尺寸，像素 */
  w: number;
  h: number;
  /** 正门相对 footprint 左上角的位置，像素 */
  entrance: [number, number];
  shapeId: string;
  billboard: boolean;
  /** 叠放顺序：高台上的房子压住低处的房子 */
  zIndex?: number;
  /** 楼层数，作为节点元数据写进场景：游戏侧要拿它算室内、屋顶高度 */
  floors?: number;
}

/** 生成"实例 + 覆盖属性"的 tscn 片段。 */
export function instanceNodes(placement: InstancePlacement, spec: PrefabSpec): string[] {
  const lines: string[] = [];
  const path = `Buildings/${placement.name}`;
  lines.push(`[node name="${placement.name}" parent="Buildings" instance=ExtResource("prefab_${placement.prefabId}")]`);
  lines.push(`position = Vector2(${placement.x}, ${placement.y})`);
  if (placement.zIndex) lines.push(`z_index = ${placement.zIndex}`);
  if (placement.floors) lines.push(`metadata/floors = ${placement.floors}`);
  lines.push('');

  if (spec.art) {
    // Art 是 Sprite2D：按 footprint 决定锚点与缩放
    const width = spec.art.width;
    const height = spec.art.height;
    if (placement.billboard) {
      // 等宽、底边贴 footprint 底边、向上溢出
      const scale = placement.w / width;
      lines.push(`[node name="Art" parent="${path}" index="0"]`);
      lines.push('centered = false');
      lines.push(`position = Vector2(${placement.w / 2}, ${placement.h})`);
      lines.push(`offset = Vector2(${(-placement.w / 2).toFixed(2)}, ${(-height * scale).toFixed(2)})`);
      lines.push(`scale = Vector2(${scale.toFixed(4)}, ${scale.toFixed(4)})`);
    } else {
      // 铺满 footprint：左上角对齐，非等比拉伸
      lines.push(`[node name="Art" parent="${path}" index="0"]`);
      lines.push('centered = false');
      lines.push('position = Vector2(0, 0)');
      lines.push('offset = Vector2(0, 0)');
      lines.push(`scale = Vector2(${(placement.w / width).toFixed(4)}, ${(placement.h / height).toFixed(4)})`);
    }
  } else {
    // Polygon2D 单位方块：直接按像素拉伸
    lines.push(`[node name="Art" parent="${path}" index="0"]`);
    lines.push(`scale = Vector2(${placement.w}, ${placement.h})`);
  }
  lines.push('');

  lines.push(`[node name="Body" parent="${path}" index="1"]`);
  lines.push(`position = Vector2(${placement.w / 2}, ${placement.h / 2})`);
  lines.push(`shape = SubResource("${placement.shapeId}")`);
  lines.push('');

  // 新增子节点：正门位置每栋都不一样，且要能被导航自检脚本直接读到
  lines.push(`[node name="Entrance" type="Marker2D" parent="${path}"]`);
  lines.push(`position = Vector2(${placement.entrance[0]}, ${placement.entrance[1]})`);
  lines.push('');
  return lines;
}

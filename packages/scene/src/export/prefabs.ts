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

/** prefab 上挂的节点（与 kit 的 nodes[] 一一对应）。 */
export interface PrefabNodeSpec {
  type: 'marker' | 'light' | 'area';
  name: string;
  /** 相对 footprint 的比例位置（0–1） */
  at: [number, number];
  props: Record<string, string | number | boolean>;
}

export interface PrefabSpec {
  id: string;
  color: string;
  roof: string;
  art?: PrefabArt;
  /** 挂在 prefab 上的节点：门口灯、交互区、路点 */
  nodes?: PrefabNodeSpec[];
  /** 灯光贴图（res:// 路径）。PointLight2D 没有贴图就什么都不画。 */
  lightTexture?: string;
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
  const nodes = spec.nodes ?? [];
  const hasLight = nodes.some((node) => node.type === 'light');
  const ext = [
    ...(spec.art ? [`[ext_resource type="Texture2D" path="${spec.art.res}" id="1_art"]`] : []),
    ...(hasLight && spec.lightTexture
      ? [`[ext_resource type="Texture2D" path="${spec.lightTexture}" id="2_light"]`]
      : []),
  ];
  const areas = nodes
    .map((node, index) => ({ node, index }))
    .filter((entry) => entry.node.type === 'area');
  const sub: string[] = [
    '[sub_resource type="RectangleShape2D" id="body"]',
    `size = Vector2(${tileSize}, ${tileSize})`,
    '',
  ];
  for (const { node, index } of areas) {
    sub.push(
      `[sub_resource type="RectangleShape2D" id="area_${index}"]`,
      `size = Vector2(${num(node.props.width, 1) * tileSize}, ${num(node.props.height, 1) * tileSize})`,
      '',
    );
  }

  const lines: string[] = [];
  // load_steps 只数真正的资源（ext + sub），空行不算——写大了 Godot 也能开，但那是骗自己
  lines.push(`[gd_scene load_steps=${ext.length + 1 + areas.length + 1} format=3]`, '');
  if (ext.length > 0) {
    lines.push(...ext, '');
  }
  lines.push(...sub);

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
  lines.push('');

  // 附加节点：位置先按"1 格"的默认 footprint 写，实例再按实际尺寸覆盖。
  // 这样同一个 prefab 用在 8×6 和 10×8 上，灯都落在门口。
  nodes.forEach((node, index) => {
    const px = node.at[0] * tileSize;
    const py = node.at[1] * tileSize;
    if (node.type === 'marker') {
      lines.push(`[node name="${node.name}" type="Marker2D" parent="."]`);
    } else if (node.type === 'light') {
      lines.push(`[node name="${node.name}" type="PointLight2D" parent="."]`);
    } else {
      lines.push(`[node name="${node.name}" type="Area2D" parent="."]`);
    }
    lines.push(`position = Vector2(${px.toFixed(2)}, ${py.toFixed(2)})`);

    if (node.type === 'light') {
      if (spec.lightTexture) lines.push('texture = ExtResource("2_light")');
      lines.push(`color = ${colorLiteral(String(node.props.color ?? '#ffd9a0'))}`);
      lines.push(`energy = ${num(node.props.energy, 1.1)}`);
      // 贴图 128px 宽、亮到边缘衰减到 0，所以可见半径 = 64 * texture_scale
      lines.push(`texture_scale = ${(num(node.props.radius, 3) * tileSize / 64).toFixed(3)}`);
      if (node.props.shadow === true) lines.push('shadow_enabled = true');
    } else if (node.type === 'area') {
      lines.push('[node name="Shape" type="CollisionShape2D" parent="' + String(node.name) + '"]');
      lines.push(`shape = SubResource("area_${index}")`);
    }
    lines.push('');
  });

  return `${lines.join('\n')}\n`;
}

/** props 里的数字可能被 JSON 写成字符串，这里统一收口。 */
function num(value: string | number | boolean | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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

  // prefab 自带的节点：位置按实际 footprint 覆盖。
  // anchor=entrance 的节点跟着正门走——门朝哪边是逐栋算的，灯不能钉死在比例位置上。
  (spec.nodes ?? []).forEach((node, offset) => {
    const [px, py] = node.props.anchor === 'entrance'
      ? placement.entrance
      : [node.at[0] * placement.w, node.at[1] * placement.h];
    lines.push(`[node name="${node.name}" parent="${path}" index="${offset + 2}"]`);
    lines.push(`position = Vector2(${px.toFixed(2)}, ${py.toFixed(2)})`);
    lines.push('');
  });
  return lines;
}

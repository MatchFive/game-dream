import { encodePng } from '@gamedream/core';
import type { SceneLayout } from '../schema.js';

/**
 * 地形图层打散成瓦片：地面、草地、道路、广场、水面，以及 S13 新增的
 * 沙滩（海岸线）、岩石（崖壁）、墙（城墙）。
 * 每种地形一到两个变体，按格子坐标确定性挑一个——同一张图不会出现"补丁感"，
 * 又不会因为纯色而显得像色块图。
 */
export type Terrain = 'ground' | 'green' | 'road' | 'plaza' | 'water' | 'sand' | 'rock' | 'wall';

export const TERRAINS: Terrain[] = ['ground', 'green', 'road', 'plaza', 'water', 'sand', 'rock', 'wall'];

const VARIANTS: Record<Terrain, number> = {
  ground: 3,
  green: 2,
  road: 1,
  plaza: 1,
  water: 2,
  sand: 2,
  rock: 2,
  wall: 1,
};

export interface TileAtlas {
  png: Buffer;
  tileSize: number;
  /** 每种地形在 atlas 里的起始列（全部排在第 0 行） */
  start: Record<Terrain, number>;
  variants: Record<Terrain, number>;
  /** 道具瓦片：透明底，叠在地形层之上 */
  propStart: Record<PropKind, number>;
  total: number;
}

/**
 * 道具瓦片：树、井、灯、箱、招牌、码头、花。
 *
 * 和地形瓦片的关键区别是**透明底**——地形是铺满的色块，道具是浮在地面上的
 * 一个小图。之前的导出根本不含道具，城里的院子、广场、街边全是空的，
 * 这是"看着像色块图"最直接的原因。
 */
export type PropKind = 'tree' | 'well' | 'lamp' | 'crate' | 'sign' | 'dock' | 'flower';

export const PROP_KINDS: PropKind[] = ['tree', 'well', 'lamp', 'crate', 'sign', 'dock', 'flower'];

const hexToRgb = (hex: string): [number, number, number] => {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
};

const rgbToHex = (rgb: [number, number, number]): string =>
  `#${rgb.map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('')}`;

/** 把 a 往 b 混合 t（0 = 全 a，1 = 全 b）。 */
const mix = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
};

const darken = (hex: string, amount: number): string => mix(hex, '#000000', amount);

/**
 * 补齐新地形的颜色：kit 可以显式给 sand/rock/wall，没给就按既有色推。
 * 这样老 kit 不用改也能导出海岸与城墙，不会因为缺颜色而崩。
 */
function resolvePalette(layout: SceneLayout): Record<Terrain, string> {
  const palette = layout.palette;
  return {
    ground: palette.ground,
    green: palette.green,
    road: palette.road,
    plaza: palette.plaza,
    water: palette.water,
    sand: palette.sand ?? mix(palette.ground, '#f2e7c9', 0.6),
    rock: palette.rock ?? darken(palette.ground, 0.42),
    wall: palette.wall ?? darken(palette.road, 0.4),
  };
}

/** 确定性噪声：同一个格子每次导出都得到同一个偏移量。 */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2654435761) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function renderTileAtlas(layout: SceneLayout): TileAtlas {
  const tileSize = layout.tileSize;
  const start = {} as Record<Terrain, number>;
  let cursor = 0;
  for (const terrain of TERRAINS) {
    start[terrain] = cursor;
    cursor += VARIANTS[terrain];
  }
  const propStart = {} as Record<PropKind, number>;
  for (const kind of PROP_KINDS) {
    propStart[kind] = cursor;
    cursor += 1;
  }
  const total = cursor;

  const width = total * tileSize;
  const height = tileSize;
  const rgba = Buffer.alloc(width * height * 4);

  const put = (x: number, y: number, r: number, g: number, b: number) => {
    const offset = (y * width + x) * 4;
    rgba[offset] = Math.max(0, Math.min(255, Math.round(r)));
    rgba[offset + 1] = Math.max(0, Math.min(255, Math.round(g)));
    rgba[offset + 2] = Math.max(0, Math.min(255, Math.round(b)));
    rgba[offset + 3] = 255;
  };

  const palette = resolvePalette(layout);

  for (const terrain of TERRAINS) {
    const base = hexToRgb(palette[terrain]);
    for (let variant = 0; variant < VARIANTS[terrain]; variant += 1) {
      const originX = (start[terrain] + variant) * tileSize;
      for (let y = 0; y < tileSize; y += 1) {
        for (let x = 0; x < tileSize; x += 1) {
          // 微噪声：±6 的明度抖动，远看是材质，近看不抢戏
          const grain = (hash(x, y, variant + 1) % 13) - 6;
          let [r, g, b] = base;

          if (terrain === 'water') {
            // 横向波纹：每 8 像素一条更亮的线，相位随变体错开
            const wave = (y + variant * 4) % 8 === 0;
            const band = wave ? 10 : 0;
            r += band + grain;
            g += band + grain;
            b += band + grain;
          } else if (terrain === 'road') {
            // 路面上一层浅色石子
            if (hash(x, y, 9) % 97 === 0) {
              r += 18;
              g += 18;
              b += 16;
            } else {
              r += grain;
              g += grain;
              b += grain;
            }
          } else if (terrain === 'green') {
            // 草：暗点当草丛，亮点当土
            const tuft = hash(x, y, 21) % 41 === 0 ? -16 : 0;
            r += grain + tuft;
            g += grain + tuft * 0.6;
            b += grain + tuft;
          } else if (terrain === 'plaza') {
            // 石板：每 8 像素一条缝
            const seam = x % 8 === 0 || y % 8 === 0 ? -14 : 0;
            r += grain + seam;
            g += grain + seam;
            b += grain + seam;
          } else if (terrain === 'sand') {
            // 沙滩：细颗粒 + 零星的贝壳亮点，不画条带（条带看起来像地毯）
            const shell = hash(x, y, 33) % 211 === 0 ? 26 : 0;
            r += grain + shell;
            g += grain + shell * 0.8;
            b += grain + shell * 0.5;
          } else if (terrain === 'rock') {
            // 崖壁：暗底 + 斜向裂缝 + 顶沿一道亮边（俯视图里这道边就是"高差"）
            const crack = (x + y * 3 + variant * 5) % 17 === 0 ? -22 : 0;
            const rim = y <= 1 ? 18 : 0;
            r += grain + crack + rim;
            g += grain + crack + rim;
            b += grain + crack + rim;
          } else if (terrain === 'wall') {
            // 城墙：错缝的石块，缝隙压暗
            const row = Math.floor(y / 8);
            const shifted = x + (row % 2 === 0 ? 0 : 4);
            const mortar = y % 8 === 0 || shifted % 8 === 0 ? -30 : 0;
            r += grain + mortar;
            g += grain + mortar;
            b += grain + mortar;
          } else {
            r += grain;
            g += grain;
            b += grain;
          }

          put(originX + x, y, r, g, b);
        }
      }
    }
  }

  // 道具瓦片：先画在 32×32 的逻辑画布上（图标不随 tileSize 变复杂），再整块放大
  const scale = tileSize / ICON;
  for (const kind of PROP_KINDS) {
    const icon = drawPropIcon(kind, layout.palette);
    const originX = propStart[kind] * tileSize;
    for (let y = 0; y < tileSize; y += 1) {
      for (let x = 0; x < tileSize; x += 1) {
        const sx = Math.min(ICON - 1, Math.floor(x / scale));
        const sy = Math.min(ICON - 1, Math.floor(y / scale));
        const source = (sy * ICON + sx) * 4;
        const target = (y * width + originX + x) * 4;
        rgba[target] = icon[source];
        rgba[target + 1] = icon[source + 1];
        rgba[target + 2] = icon[source + 2];
        rgba[target + 3] = icon[source + 3];
      }
    }
  }

  return { png: encodePng(width, height, rgba), tileSize, start, variants: VARIANTS, propStart, total };
}

/** 道具图标的逻辑画布尺寸（放大到 tileSize 后仍然清晰）。 */
const ICON = 32;

/**
 * 画一个道具图标：透明底 + 具体物件。
 *
 * 这些图形只求"远看能认出来"：一棵树是绿冠 + 树干，一口井是灰环 + 水面，
 * 一盏灯是杆子 + 光点。真正的美术在 T1（真 tileset）里替换，
 * 但"有东西"和"什么都没有"是两回事——之前导出的城里没有任何道具，
 * 院子、广场、街边全是空的。
 */
function drawPropIcon(kind: PropKind, palette: SceneLayout['palette']): Buffer {
  const icon = Buffer.alloc(ICON * ICON * 4); // 全 0 = 全透明

  const set = (x: number, y: number, hex: string, alpha = 255) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= ICON || py >= ICON) return;
    const [r, g, b] = hexToRgb(hex);
    const offset = (py * ICON + px) * 4;
    icon[offset] = r;
    icon[offset + 1] = g;
    icon[offset + 2] = b;
    icon[offset + 3] = alpha;
  };
  const box = (x: number, y: number, w: number, h: number, hex: string, alpha = 255) => {
    for (let dy = 0; dy < h; dy += 1) {
      for (let dx = 0; dx < w; dx += 1) set(x + dx, y + dy, hex, alpha);
    }
  };
  const disc = (cx: number, cy: number, radius: number, hex: string, alpha = 255) => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx * dx + dy * dy <= radius * radius) set(cx + dx, cy + dy, hex, alpha);
      }
    }
  };

  switch (kind) {
    case 'tree': {
      // 缩到 8px 时只剩"外轮廓 + 明暗"两件事能看清，
      // 所以边压暗、主体中间调、高光小一圈——高光画大了远看就成空心环
      const canopy = darken(palette.green, 0.34);
      box(15, 20, 3, 11, '#6b4a2f'); // 树干先画，树冠盖住上半截
      disc(16, 13, 13, darken(canopy, 0.3));
      disc(16, 13, 12, canopy);
      disc(12, 9, 4, mix(canopy, '#ffffff', 0.14));
      break;
    }
    case 'well': {
      disc(16, 18, 11, '#7c7c74');
      disc(16, 18, 8, '#4a4a44');
      disc(16, 18, 6, mix(palette.water, '#000000', 0.25));
      box(5, 7, 3, 12, '#6b5a44');
      box(24, 7, 3, 12, '#6b5a44');
      box(5, 6, 22, 2, '#8a6f4d');
      break;
    }
    case 'lamp': {
      disc(16, 10, 10, '#f2c14e', 45); // 光晕
      box(15, 10, 2, 18, '#4c4a45');
      disc(16, 9, 4, '#f2c14e');
      disc(16, 9, 2, '#fff6cf');
      break;
    }
    case 'crate': {
      box(8, 9, 16, 16, '#a9793f');
      box(8, 9, 16, 2, '#c08f52');
      box(8, 23, 16, 2, '#8a5f30');
      for (let i = 0; i < 16; i += 1) set(8 + i, 9 + i, '#8a5f30');
      break;
    }
    case 'sign': {
      box(15, 12, 2, 14, '#6b5a44');
      box(7, 4, 18, 11, '#8a6f4d');
      box(8, 7, 16, 1, mix(palette.ground, '#ffffff', 0.4));
      box(8, 11, 11, 1, mix(palette.ground, '#ffffff', 0.4));
      break;
    }
    case 'dock': {
      box(2, 12, 28, 8, '#8b5e3c');
      for (let x = 2; x < 30; x += 4) box(x, 12, 1, 8, '#6b4429');
      box(2, 12, 28, 1, '#a97a52');
      break;
    }
    case 'flower': {
      disc(16, 19, 9, darken(palette.green, 0.25));
      disc(11, 14, 3, '#e07aa8');
      disc(20, 15, 3, '#e07aa8');
      disc(16, 10, 3, '#f3a6c4');
      disc(16, 19, 2, '#f7d774');
      break;
    }
    default:
      break;
  }

  return icon;
}

/** TileSet 资源：一张 atlas + 每种地形一个瓦片。 */
export function tileSetResource(layout: SceneLayout, atlas: TileAtlas): string {
  const lines: string[] = [];
  lines.push('[gd_resource type="TileSet" load_steps=3 format=3]', '');
  lines.push('[ext_resource type="Texture2D" path="res://scene/tiles.png" id="1_tiles"]', '');
  lines.push('[sub_resource type="TileSetAtlasSource" id="tileset_source"]');
  lines.push('texture = ExtResource("1_tiles")');
  lines.push(`texture_region_size = Vector2i(${atlas.tileSize}, ${atlas.tileSize})`);
  for (const terrain of TERRAINS) {
    for (let variant = 0; variant < atlas.variants[terrain]; variant += 1) {
      lines.push(`${atlas.start[terrain] + variant}:0/0 = 0`);
    }
  }
  for (const kind of PROP_KINDS) {
    lines.push(`${atlas.propStart[kind]}:0/0 = 0`);
  }
  lines.push('');
  lines.push('[resource]');
  lines.push(`tile_size = Vector2i(${atlas.tileSize}, ${atlas.tileSize})`);
  lines.push('sources/0 = SubResource("tileset_source")');
  return `${lines.join('\n')}\n`;
}

export interface TileCell {
  x: number;
  y: number;
  atlas: number;
}

export interface TileLayers {
  ground: TileCell[];
  roads: TileCell[];
  props: TileCell[];
  counts: Record<Terrain, number>;
}

/**
 * 从布局还原逐格地形。
 *
 * 布局里没有保留栅格（那会让 trace 膨胀 20 倍），所以这里按"地块 → 道路折线"
 * 重画一遍：先铺地块色，再按折线宽度覆盖道路。桥梁因此天然出现——
 * 道路画在水面之上。
 */
export function buildTileLayers(layout: SceneLayout, atlas: TileAtlas): TileLayers {
  const W = layout.bounds.width;
  const H = layout.bounds.height;
  const under = new Array<Terrain>(W * H).fill('ground');
  const roads = new Set<number>();

  const idx = (x: number, y: number) => y * W + x;
  const setUnder = (x: number, y: number, terrain: Terrain) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    under[idx(x, y)] = terrain;
  };

  for (const lot of layout.lots) {
    const terrain: Terrain | null = lot.kind === 'green'
      ? 'green'
      : lot.kind === 'plaza'
        ? 'plaza'
        : lot.kind === 'water'
          ? 'water'
          : null;
    if (!terrain) continue;
    for (let y = lot.rect.y; y < lot.rect.y + lot.rect.h; y += 1) {
      for (let x = lot.rect.x; x < lot.rect.x + lot.rect.w; x += 1) setUnder(x, y, terrain);
    }
  }

  // 岸线：挨着水的陆地铺一格沙。河、塘、海共用同一条规则——
  // 只要水边是"陆地色"，一眼就看得出这是岸，不会像水被裁了个直角。
  const isWater = (x: number, y: number) => under[idx(x, y)] === 'water';
  const sand: Array<[number, number]> = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (under[idx(x, y)] === 'water') continue;
      if (isWater(x - 1, y) || isWater(x + 1, y) || isWater(x, y - 1) || isWater(x, y + 1)) {
        sand.push([x, y]);
      }
    }
  }
  for (const [x, y] of sand) setUnder(x, y, 'sand');

  const paintRects = (segments: Array<{ rect: { x: number; y: number; w: number; h: number } }>, terrain: Terrain) => {
    for (const { rect } of segments) {
      for (let y = rect.y; y < rect.y + rect.h; y += 1) {
        for (let x = rect.x; x < rect.x + rect.w; x += 1) setUnder(x, y, terrain);
      }
    }
  };
  paintRects(layout.walls, 'wall');
  paintRects(layout.cliffs, 'rock');

  const markRoad = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    roads.add(idx(x, y));
  };

  for (const road of layout.roads) {
    for (let i = 1; i < road.points.length; i += 1) {
      const [x1, y1] = road.points[i - 1];
      const [x2, y2] = road.points[i];
      if (x1 === x2) {
        const left = x1 - Math.floor((road.width - 1) / 2);
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y += 1) {
          for (let x = left; x < left + road.width; x += 1) markRoad(x, y);
        }
      } else {
        const top = y1 - Math.floor((road.width - 1) / 2);
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x += 1) {
          for (let y = top; y < top + road.width; y += 1) markRoad(x, y);
        }
      }
    }
  }

  const atlasOf = (terrain: Terrain, x: number, y: number): number => {
    const variants = atlas.variants[terrain];
    const pick = variants === 1 ? 0 : (x * 7 + y * 13) % variants;
    return atlas.start[terrain] + pick;
  };

  const counts: Record<Terrain, number> = {
    ground: 0,
    green: 0,
    road: 0,
    plaza: 0,
    water: 0,
    sand: 0,
    rock: 0,
    wall: 0,
  };
  const ground: TileCell[] = [];
  const roadCells: TileCell[] = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const terrain = under[idx(x, y)];
      counts[terrain] += 1;
      ground.push({ x, y, atlas: atlasOf(terrain, x, y) });
      if (roads.has(idx(x, y))) {
        counts.road += 1;
        roadCells.push({ x, y, atlas: atlasOf('road', x, y) });
      }
    }
  }

  // 道具：每格一个，透明底叠在地形之上。坐标就是格子坐标，不用额外校准。
  const propCells: TileCell[] = [];
  for (const prop of layout.props) {
    const [x, y] = prop.at;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    propCells.push({ x, y, atlas: atlas.propStart[prop.type] });
  }

  return { ground, roads: roadCells, props: propCells, counts };
}

/**
 * TileMapLayer 的 `tile_map_data`：2 字节版本号 + 每格 12 字节
 * （x, y, source_id, atlas_x, atlas_y, alternative，全部 uint16 小端）。
 * 这个格式是拿真实引擎写一遍再读回来核对的，不是猜的。
 */
export function encodeTileMapData(cells: TileCell[], sourceId = 0): string {
  const buffer = Buffer.alloc(2 + cells.length * 12);
  buffer.writeUInt16LE(0, 0);
  let offset = 2;
  for (const cell of cells) {
    buffer.writeUInt16LE(cell.x & 0xffff, offset);
    buffer.writeUInt16LE(cell.y & 0xffff, offset + 2);
    buffer.writeUInt16LE(sourceId, offset + 4);
    buffer.writeUInt16LE(cell.atlas, offset + 6);
    buffer.writeUInt16LE(0, offset + 8);
    buffer.writeUInt16LE(0, offset + 10);
    offset += 12;
  }
  return `PackedByteArray(${Array.from(buffer).join(', ')})`;
}

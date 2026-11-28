import { encodePng } from '@gamedream/core';
import type { SceneLayout } from '../schema.js';

/**
 * 地形图层打散成瓦片：地面、草地、道路、广场、水面。
 * 每种地形一到两个变体，按格子坐标确定性挑一个——同一张图不会出现"补丁感"，
 * 又不会因为纯色而显得像色块图。
 */
export type Terrain = 'ground' | 'green' | 'road' | 'plaza' | 'water';

export const TERRAINS: Terrain[] = ['ground', 'green', 'road', 'plaza', 'water'];

const VARIANTS: Record<Terrain, number> = {
  ground: 3,
  green: 2,
  road: 1,
  plaza: 1,
  water: 2,
};

export interface TileAtlas {
  png: Buffer;
  tileSize: number;
  /** 每种地形在 atlas 里的起始列（全部排在第 0 行） */
  start: Record<Terrain, number>;
  variants: Record<Terrain, number>;
  total: number;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
};

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

  for (const terrain of TERRAINS) {
    const base = hexToRgb(layout.palette[terrain]);
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

  return { png: encodePng(width, height, rgba), tileSize, start, variants: VARIANTS, total };
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

  const counts: Record<Terrain, number> = { ground: 0, green: 0, road: 0, plaza: 0, water: 0 };
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

  return { ground, roads: roadCells, counts };
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

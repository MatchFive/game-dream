import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { PROP_KINDS, TERRAINS, type Terrain, type PropKind } from './tiles.js';

// ESM 里没有 require；pngjs 也没有类型，这里只用到同步读写
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs') as {
  PNG: {
    sync: {
      read: (buffer: Buffer) => { width: number; height: number; data: Buffer };
      write: (image: { width: number; height: number; data: Buffer }) => Buffer;
    };
  };
};

type Png = { width: number; height: number; data: Buffer };

/**
 * 素材选取表：**哪张图的哪一格**当哪种地形/道具。
 *
 * 这张表是数据，不是代码。换素材库、换题材只要改表重跑，
 * 不用动求解器、导出器、kit 定义——这是"素材能持续接进来"的前提。
 */
export interface TilePicks {
  kitId: string;
  /** 裁剪单元边长（像素）。A2/A4 是 96。 */
  cellSize?: number;
  note?: string;
  terrain?: Partial<Record<Terrain, TilePick[]>>;
  props?: Partial<Record<PropKind, TilePick>>;
}

export interface TilePick {
  /** 相对素材库根的路径 */
  file: string;
  /** [行, 列]，按 cellSize 切 */
  cell?: [number, number];
  /** [x, y, w, h]，直接给像素（道具常用） */
  rect?: [number, number, number, number];
  /**
   * 以单元内这个点为中心的搜索半径。A2 单元上半是 autotile 四角、下半才是本体纹理，
   * 所以一般取 `at: [24, 72]`；不给就自己挑"最平最无缝"的一块。
   */
  at?: [number, number];
  radius?: number;
  /** false = 整格缩放到 tileSize，不做无缝搜索 */
  auto?: boolean;
}

export interface TileImportResult {
  kitDir: string;
  files: string[];
  terrains: Terrain[];
  props: PropKind[];
}

const boxOf = (pick: TilePick, cellSize: number) => {
  if (pick.cell) {
    const [row, col] = pick.cell;
    return { x: col * cellSize, y: row * cellSize, w: cellSize, h: cellSize };
  }
  const [x, y, w, h] = pick.rect ?? [0, 0, cellSize, cellSize];
  return { x, y, w, h };
};

/**
 * 在单元里找最"可平铺"的 size×size 窗口。
 *
 * 打分 = 左右/上下 wrap 的色差（接缝）×3 + 内部梯度 ×0.15。
 * 选了 `at` 就只在附近找——否则会挑到单元里另一半完全不同的材质。
 */
export function bestWindow(
  png: Png,
  box: { x: number; y: number; w: number; h: number },
  size: number,
  hint?: { at: [number, number]; radius?: number },
): { x: number; y: number; w: number; h: number; score: number } {
  let best = { x: box.x, y: box.y, score: Infinity };
  const radius = hint ? (hint.radius ?? 24) : null;
  const hx = hint ? box.x + hint.at[0] : 0;
  const hy = hint ? box.y + hint.at[1] : 0;
  for (let oy = 0; oy + size <= box.h; oy += 4) {
    for (let ox = 0; ox + size <= box.w; ox += 4) {
      if (radius !== null) {
        const cx = box.x + ox + size / 2;
        const cy = box.y + oy + size / 2;
        if (Math.abs(cx - hx) > radius || Math.abs(cy - hy) > radius) continue;
      }
      let seamV = 0;
      let seamH = 0;
      let smooth = 0;
      for (let i = 0; i < size; i += 1) {
        const a = ((box.y + oy + i) * png.width + (box.x + ox)) * 4;
        const b = ((box.y + oy + i) * png.width + (box.x + ox + size - 1)) * 4;
        seamV += Math.abs(png.data[a] - png.data[b])
          + Math.abs(png.data[a + 1] - png.data[b + 1])
          + Math.abs(png.data[a + 2] - png.data[b + 2]);
        const c = ((box.y + oy) * png.width + (box.x + ox + i)) * 4;
        const d = ((box.y + oy + size - 1) * png.width + (box.x + ox + i)) * 4;
        seamH += Math.abs(png.data[c] - png.data[d])
          + Math.abs(png.data[c + 1] - png.data[d + 1])
          + Math.abs(png.data[c + 2] - png.data[d + 2]);
      }
      for (let y = 0; y < size - 1; y += 1) {
        for (let x = 0; x < size - 1; x += 1) {
          const a = ((box.y + oy + y) * png.width + (box.x + ox + x)) * 4;
          smooth += Math.abs(png.data[a] - png.data[a + 4]) + Math.abs(png.data[a] - png.data[a + png.width * 4]);
        }
      }
      const score = seamV * 3 + seamH * 3 + smooth * 0.15;
      if (score < best.score) best = { x: box.x + ox, y: box.y + oy, score };
    }
  }
  return { x: best.x, y: best.y, w: size, h: size, score: Math.round(best.score) };
}

/**
 * 面积平均降采样。
 *
 * 96→32 直接用最近邻会丢掉三格里的两格，纹理变成噪点；平均采样才留得住材质。
 * 尺寸相同就直接搬（像素风不能插值）。
 */
export function resample(png: Png, box: { x: number; y: number; w: number; h: number }, size: number): Png {
  const source = crop(png, box);
  if (box.w === size && box.h === size) return source;
  const out: Png = { width: size, height: size, data: Buffer.alloc(size * size * 4) };
  const sx = box.w / size;
  const sy = box.h / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      const x0 = Math.floor(x * sx);
      const y0 = Math.floor(y * sy);
      const x1 = Math.min(box.w, Math.max(x0 + 1, Math.floor((x + 1) * sx)));
      const y1 = Math.min(box.h, Math.max(y0 + 1, Math.floor((y + 1) * sy)));
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          const o = (yy * source.width + xx) * 4;
          const alpha = source.data[o + 3] / 255;
          r += source.data[o] * alpha;
          g += source.data[o + 1] * alpha;
          b += source.data[o + 2] * alpha;
          a += alpha;
          n += 1;
        }
      }
      const d = (y * size + x) * 4;
      if (a > 0) {
        out.data[d] = Math.round(r / a);
        out.data[d + 1] = Math.round(g / a);
        out.data[d + 2] = Math.round(b / a);
      }
      out.data[d + 3] = Math.round((a / Math.max(1, n)) * 255);
    }
  }
  return out;
}

function crop(png: Png, box: { x: number; y: number; w: number; h: number }): Png {
  const out = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y += 1) {
    for (let x = 0; x < box.w; x += 1) {
      const s = ((box.y + y) * png.width + (box.x + x)) * 4;
      const d = (y * box.w + x) * 4;
      out[d] = png.data[s];
      out[d + 1] = png.data[s + 1];
      out[d + 2] = png.data[s + 2];
      out[d + 3] = png.data[s + 3];
    }
  }
  return { width: box.w, height: box.h, data: out };
}

/**
 * 把外部素材库的瓦片整理进 `<artDir>/<kitId>/tiles|props/`。
 *
 * 产物是**派生数据**（本地缓存，可重建），仓库里只留选取表——所以换素材、
 * 换题材都不用提交二进制文件。导出器按同名约定读取，两边不需要互相知道。
 */
export function importTiles(options: {
  source: string;
  artDir: string;
  picks: TilePicks;
  tileSize?: number;
}): TileImportResult {
  const tileSize = options.tileSize ?? 32;
  const cellSize = options.picks.cellSize ?? 96;
  const kitDir = join(options.artDir, options.picks.kitId);
  if (!existsSync(options.source)) throw new Error(`asset library not found: ${options.source}`);

  // 先清旧产物：只写不删的话，换了选取表之后旧文件会作为"额外变体"被读进去
  // （上一版的地板混进这一版的石板路，而且极难看出是哪来的）。
  for (const sub of ['tiles', 'props']) {
    rmSync(join(kitDir, sub), { recursive: true, force: true });
  }

  const cache = new Map<string, Png>();
  const load = (file: string): Png => {
    if (!cache.has(file)) {
      const full = join(options.source, file);
      if (!existsSync(full)) throw new Error(`missing sheet: ${file}`);
      cache.set(file, PNG.sync.read(readFileSync(full)));
    }
    return cache.get(file) as Png;
  };

  const files: string[] = [];
  const write = (sub: string, name: string, image: Png): void => {
    const dir = join(kitDir, sub);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, name);
    writeFileSync(file, PNG.sync.write(image));
    files.push(file);
  };

  const terrains: Terrain[] = [];
  for (const terrain of TERRAINS) {
    const picks = options.picks.terrain?.[terrain];
    if (!picks || picks.length === 0) continue;
    terrains.push(terrain);
    picks.forEach((pick, index) => {
      const png = load(pick.file);
      const cell = boxOf(pick, cellSize);
      const box = pick.auto === false
        ? cell
        : bestWindow(png, cell, tileSize, pick.at ? { at: pick.at, radius: pick.radius } : undefined);
      write('tiles', index === 0 ? `${terrain}.png` : `${terrain}-${index}.png`, resample(png, box, tileSize));
    });
  }

  const props: PropKind[] = [];
  for (const kind of PROP_KINDS) {
    const pick = options.picks.props?.[kind];
    if (!pick) continue;
    props.push(kind);
    write('props', `${kind}.png`, crop(load(pick.file), boxOf(pick, cellSize)));
  }

  return { kitDir, files, terrains, props };
}

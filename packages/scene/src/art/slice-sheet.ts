import { createRequire } from 'node:module';
import type { Rect } from '../schema.js';

// ESM 里没有 require；pngjs 也没有类型，这里只用到同步读写
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs') as {
  PNG: {
    sync: {
      read: (buffer: Buffer) => Png;
      write: (image: Png) => Buffer;
    };
  };
};

export interface Png {
  width: number;
  height: number;
  data: Buffer;
}

export interface Sprite extends Rect {
  /** 在图集里的序号（按阅读顺序：先上后下、先左后右） */
  index: number;
  /** 前景像素数，用来判断"这块是实心物件还是描边碎片" */
  area: number;
}

export interface SliceOptions {
  /** alpha 大于这个值算前景 */
  alphaMin?: number;
  /** 小于这个边长的精灵丢掉（碎片、噪点） */
  minSide?: number;
  /** 小于这个前景像素数的丢掉 */
  minArea?: number;
  /** 超过这个边长的块按全透明行列再切一刀（整排建筑会连成一片） */
  splitAbove?: number;
}

/**
 * 把一张图集切成独立精灵。
 *
 * 两步，缺一不可：
 * 1. 8 邻接连通域 —— 斜屋檐、系船的绳子都是斜向相连，4 邻接会把一栋楼切成好几块；
 * 2. 大块按全透明行列投影再切 —— 素材里同一排建筑常常紧贴着，连通域会连成一条。
 *
 * 切不准的代价很直接：后面让模型"按编号认东西"时，编号对应的可能就是半栋楼。
 */
export function sliceSheet(png: Png, options: SliceOptions = {}): Sprite[] {
  const alphaMin = options.alphaMin ?? 16;
  const minSide = options.minSide ?? 12;
  const minArea = options.minArea ?? 120;
  const splitAbove = options.splitAbove ?? 260;

  const n = png.width * png.height;
  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) solid[i] = png.data[i * 4 + 3] > alphaMin ? 1 : 0;

  const seen = new Uint8Array(n);
  const stack: number[] = [];
  const raw: Array<Rect & { area: number }> = [];
  for (let start = 0; start < n; start += 1) {
    if (!solid[start] || seen[start]) continue;
    let minX = png.width;
    let minY = png.height;
    let maxX = -1;
    let maxY = -1;
    let area = 0;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const p = stack.pop() as number;
      const x = p % png.width;
      const y = (p - x) / png.width;
      area += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= png.width || ny >= png.height) continue;
          const q = ny * png.width + nx;
          if (solid[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    raw.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
  }

  const expanded: Array<Rect & { area: number }> = [];
  for (const box of raw) {
    if (box.w > splitAbove || box.h > splitAbove) expanded.push(...splitBox(png, box, alphaMin));
    else expanded.push(box);
  }

  const sprites = expanded
    .filter((box) => box.w >= minSide && box.h >= minSide && box.area >= minArea)
    // 阅读顺序：先上后下、先左后右，每 24px 算同一行——观察者看拼版时就是这个顺序
    .sort((a, b) => (Math.abs(a.y - b.y) > 24 ? a.y - b.y : a.x - b.x))
    .map((box, index) => ({ ...box, index }));
  return sprites;
}

/** 大块按"整列/整行全透明"的位置切开；切不动就原样返回。 */
function splitBox(png: Png, box: Rect & { area: number }, alphaMin: number): Array<Rect & { area: number }> {
  const cols = new Array(box.w).fill(0) as number[];
  const rows = new Array(box.h).fill(0) as number[];
  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      if (png.data[(y * png.width + x) * 4 + 3] > alphaMin) {
        cols[x - box.x] += 1;
        rows[y - box.y] += 1;
      }
    }
  }
  const runs = (counts: number[], offset: number, minThick: number): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    let startIndex = -1;
    for (let i = 0; i < counts.length; i += 1) {
      if (counts[i] > 0 && startIndex < 0) startIndex = i;
      const ended = counts[i] === 0 && startIndex >= 0;
      const last = i === counts.length - 1 && startIndex >= 0;
      if (ended || last) {
        const end = ended ? i - 1 : i;
        if (end - startIndex + 1 >= minThick) out.push([offset + startIndex, end - startIndex + 1]);
        startIndex = -1;
      }
    }
    return out;
  };
  const pieces: Array<Rect & { area: number }> = [];
  for (const [x, w] of runs(cols, box.x, 24)) {
    for (const [y, h] of runs(rows, box.y, 24)) {
      pieces.push({ x, y, w, h, area: box.area });
    }
  }
  return pieces.length > 1 ? pieces : [box];
}

/** 裁出一个精灵（透明底保持原样）。 */
export function cropSprite(png: Png, sprite: Rect): Png {
  const out: Png = { width: sprite.w, height: sprite.h, data: Buffer.alloc(sprite.w * sprite.h * 4) };
  for (let y = 0; y < sprite.h; y += 1) {
    for (let x = 0; x < sprite.w; x += 1) {
      const s = ((sprite.y + y) * png.width + (sprite.x + x)) * 4;
      const d = (y * sprite.w + x) * 4;
      out.data[d] = png.data[s];
      out.data[d + 1] = png.data[s + 1];
      out.data[d + 2] = png.data[s + 2];
      out.data[d + 3] = png.data[s + 3];
    }
  }
  return out;
}

const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};

/**
 * 拼一张带编号的预览图。
 *
 * 编号是这个功能的支点：模型看的是这张图，回答里只给编号，我们再用编号回查
 * 原始坐标。所以编号必须是**肉眼可读**的——用 3×5 的点阵数字放大 2–3 倍画在角落，
 * 而不是依赖任何字体文件。
 */
export function contactSheet(
  png: Png,
  sprites: Sprite[],
  options: { cols?: number; cell?: number; background?: [number, number, number] } = {},
): Png {
  const cols = options.cols ?? 6;
  const cell = options.cell ?? 176;
  const bg = options.background ?? [255, 255, 255];
  const rows = Math.max(1, Math.ceil(sprites.length / cols));
  const sheet: Png = { width: cols * cell, height: rows * cell, data: Buffer.alloc(cols * cell * rows * cell * 4) };
  for (let i = 0; i < sheet.data.length; i += 4) {
    sheet.data[i] = bg[0];
    sheet.data[i + 1] = bg[1];
    sheet.data[i + 2] = bg[2];
    sheet.data[i + 3] = 255;
  }
  const labelScale = Math.max(2, Math.round(cell / 60));

  sprites.forEach((sprite, position) => {
    const cx = (position % cols) * cell;
    const cy = Math.floor(position / cols) * cell;
    const inner = cell - 16;
    const scale = Math.min(1, inner / Math.max(sprite.w, sprite.h));
    const tw = Math.max(1, Math.round(sprite.w * scale));
    const th = Math.max(1, Math.round(sprite.h * scale));
    const ox = cx + Math.round((cell - tw) / 2);
    const oy = cy + Math.round((cell - th) / 2);
    for (let y = 0; y < th; y += 1) {
      for (let x = 0; x < tw; x += 1) {
        const sx = sprite.x + Math.min(sprite.w - 1, Math.floor(x / scale));
        const sy = sprite.y + Math.min(sprite.h - 1, Math.floor(y / scale));
        const s = (sy * png.width + sx) * 4;
        const alpha = png.data[s + 3] / 255;
        if (alpha < 0.02) continue;
        const d = ((oy + y) * sheet.width + ox + x) * 4;
        sheet.data[d] = Math.round(png.data[s] * alpha + sheet.data[d] * (1 - alpha));
        sheet.data[d + 1] = Math.round(png.data[s + 1] * alpha + sheet.data[d + 1] * (1 - alpha));
        sheet.data[d + 2] = Math.round(png.data[s + 2] * alpha + sheet.data[d + 2] * (1 - alpha));
      }
    }
    drawNumber(sheet, sprite.index, cx + 4, cy + 4, labelScale);
  });
  return sheet;
}

function drawNumber(sheet: Png, value: number, x0: number, y0: number, scale: number): void {
  let cursor = x0;
  for (const ch of String(value)) {
    const glyph = DIGITS[ch];
    if (!glyph) {
      cursor += 4 * scale;
      continue;
    }
    for (let gy = 0; gy < 5; gy += 1) {
      for (let gx = 0; gx < 3; gx += 1) {
        if (glyph[gy][gx] !== '1') continue;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const px = cursor + gx * scale + dx;
            const py = y0 + gy * scale + dy;
            if (px >= sheet.width || py >= sheet.height) continue;
            const o = (py * sheet.width + px) * 4;
            sheet.data[o] = 24;
            sheet.data[o + 1] = 24;
            sheet.data[o + 2] = 24;
            sheet.data[o + 3] = 255;
          }
        }
      }
    }
    cursor += 4 * scale;
  }
}

export function encodePngImage(png: Png): Buffer {
  return PNG.sync.write({ width: png.width, height: png.height, data: png.data });
}

export function decodePngImage(buffer: Buffer): Png {
  return PNG.sync.read(buffer);
}

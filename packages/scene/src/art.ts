import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from '@gamedream/core';
import type { Kit, Prefab, SceneLayout } from './schema.js';

type Rgb = [number, number, number];

const hexToRgb = (hex: string): Rgb => {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
};

const shade = (rgb: Rgb, amount: number): Rgb => [
  Math.max(0, Math.min(255, Math.round(rgb[0] * (1 + amount)))),
  Math.max(0, Math.min(255, Math.round(rgb[1] * (1 + amount)))),
  Math.max(0, Math.min(255, Math.round(rgb[2] * (1 + amount)))),
];

/** 极小的光栅画布：只够画建筑顶视图，不引第三方依赖。 */
class Canvas {
  readonly width: number;
  readonly height: number;
  private readonly pixels: Buffer;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = Buffer.alloc(width * height * 4);
  }

  private blend(x: number, y: number, rgb: Rgb, alpha: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || alpha <= 0) return;
    const offset = (y * this.width + x) * 4;
    const dstA = this.pixels[offset + 3] / 255;
    const srcA = Math.min(1, alpha);
    const outA = srcA + dstA * (1 - srcA);
    if (outA <= 0) return;
    for (let channel = 0; channel < 3; channel += 1) {
      const src = rgb[channel];
      const dst = this.pixels[offset + channel];
      this.pixels[offset + channel] = Math.round((src * srcA + dst * dstA * (1 - srcA)) / outA);
    }
    this.pixels[offset + 3] = Math.round(outA * 255);
  }

  rect(x: number, y: number, w: number, h: number, rgb: Rgb, alpha = 1): void {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) this.blend(col, row, rgb, alpha);
    }
  }

  /** 带 45° 切角的矩形，看起来不像纯方块。 */
  chamferedRect(x: number, y: number, w: number, h: number, rgb: Rgb, cut: number): void {
    for (let row = 0; row < h; row += 1) {
      for (let col = 0; col < w; col += 1) {
        const nearLeft = col < cut;
        const nearRight = col >= w - cut;
        const nearTop = row < cut;
        const nearBottom = row >= h - cut;
        const inCorner = (nearLeft || nearRight) && (nearTop || nearBottom);
        if (inCorner) {
          const dx = nearLeft ? cut - col : col - (w - cut) + 1;
          const dy = nearTop ? cut - row : row - (h - cut) + 1;
          if (dx + dy > cut) continue;
        }
        this.blend(x + col, y + row, rgb, 1);
      }
    }
  }

  line(x1: number, y1: number, x2: number, y2: number, rgb: Rgb, thickness = 1, alpha = 1): void {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = Math.round(x1 + (x2 - x1) * t);
      const y = Math.round(y1 + (y2 - y1) * t);
      const half = Math.floor(thickness / 2);
      for (let oy = -half; oy <= thickness - 1 - half; oy += 1) {
        for (let ox = -half; ox <= thickness - 1 - half; ox += 1) {
          this.blend(x + ox, y + oy, rgb, alpha);
        }
      }
    }
  }

  toPng(): Buffer {
    return encodePng(this.width, this.height, this.pixels);
  }
}

/**
 * 生成一个 prefab 的顶视占位美术：屋顶、屋脊、屋檐阴影、门窗。
 * 目标是风格统一、尺寸贴合 footprint，能直接用于引擎与预览；
 * 换成真实美术时只要替换同名文件即可。
 */
export function renderPrefabArtwork(prefab: Prefab, tileSize: number): Buffer {
  const width = prefab.footprint.maxWidth * tileSize;
  const height = prefab.footprint.maxHeight * tileSize;
  const canvas = new Canvas(width, height);
  const base = hexToRgb(prefab.color);
  const dark = shade(base, -0.42);
  const light = shade(base, 0.18);

  const margin = Math.max(2, Math.round(tileSize * 0.12));
  const w = width - margin * 2;
  const h = height - margin * 2;

  // 地面投影
  canvas.rect(margin + 3, margin + 4, w, h, [0, 0, 0], 0.16);
  // 墙体（比屋顶略大一圈，形成屋檐）
  canvas.chamferedRect(margin, margin, w, h, dark, Math.round(tileSize * 0.18));
  // 屋面
  const inset = Math.max(2, Math.round(tileSize * 0.14));
  canvas.chamferedRect(margin + inset, margin + inset, w - inset * 2, h - inset * 2, base, Math.round(tileSize * 0.14));
  // 屋面高光（左上一半更亮，制造受光感）
  canvas.rect(margin + inset, margin + inset, Math.floor((w - inset * 2) / 2), Math.floor((h - inset * 2) / 2), light, 0.35);

  const cy = margin + Math.floor(h / 2);
  const cx = margin + Math.floor(w / 2);
  if (prefab.roof === 'gable') {
    canvas.line(margin + inset, cy, margin + w - inset, cy, dark, Math.max(2, Math.round(tileSize * 0.1)), 0.9);
  } else if (prefab.roof === 'hip') {
    canvas.line(margin + inset, cy, margin + w - inset, cy, dark, Math.max(2, Math.round(tileSize * 0.1)), 0.85);
    canvas.line(cx, margin + inset, cx, margin + h - inset, dark, Math.max(2, Math.round(tileSize * 0.1)), 0.85);
  } else {
    canvas.rect(margin + inset, margin + inset, w - inset * 2, Math.max(1, Math.round(tileSize * 0.06)), dark, 0.6);
  }

  // 门（下缘中央）与两扇窗
  const doorW = Math.max(4, Math.round(tileSize * 0.42));
  const doorH = Math.max(5, Math.round(tileSize * 0.5));
  canvas.rect(cx - Math.floor(doorW / 2), margin + h - doorH, doorW, doorH, dark, 0.95);
  const windowSize = Math.max(3, Math.round(tileSize * 0.28));
  canvas.rect(margin + Math.round(w * 0.22), cy - Math.round(windowSize / 2), windowSize, windowSize, [250, 238, 205], 0.9);
  canvas.rect(margin + Math.round(w * 0.62), cy - Math.round(windowSize / 2), windowSize, windowSize, [250, 238, 205], 0.9);
  // 外轮廓
  canvas.chamferedRect(margin, margin, w, 2, dark, 0);
  canvas.chamferedRect(margin, margin + h - 2, w, 2, dark, 0);
  canvas.chamferedRect(margin, margin, 2, h, dark, 0);
  canvas.chamferedRect(margin + w - 2, margin, 2, h, dark, 0);

  return canvas.toPng();
}

export interface KitArtworkManifest {
  kitId: string;
  tileSize: number;
  generatedAt: string;
  entries: Array<{ prefab: string; file: string; width: number; height: number }>;
}

/**
 * 给整套 kit 生成占位美术并写 manifest。
 * 产出目录可以直接作为 kit 的 artwork 目录，导出时按文件名取图。
 */
export function writeKitArtwork(
  kit: Kit,
  outDir: string,
  options: { tileSize?: number } = {},
): KitArtworkManifest {
  const tileSize = options.tileSize ?? 32;
  const dir = join(outDir, kit.id);
  mkdirSync(dir, { recursive: true });
  const entries: KitArtworkManifest['entries'] = [];
  for (const prefab of kit.prefabs) {
    const file = `${prefab.id}.png`;
    writeFileSync(join(dir, file), renderPrefabArtwork(prefab, tileSize));
    entries.push({
      prefab: prefab.id,
      file: `${kit.id}/${file}`,
      width: prefab.footprint.maxWidth * tileSize,
      height: prefab.footprint.maxHeight * tileSize,
    });
  }
  const manifest: KitArtworkManifest = {
    kitId: kit.id,
    tileSize,
    generatedAt: new Date().toISOString(),
    entries,
  };
  writeFileSync(join(outDir, `${kit.id}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

/** 把布局里用到的 prefab 去重，方便导出时按需复制贴图。 */
export function prefabsInUse(layout: SceneLayout, kit: Kit): Prefab[] {
  const ids = new Set(layout.buildings.map((building) => building.prefab));
  return kit.prefabs.filter((prefab) => ids.has(prefab.id));
}

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { PROP_KINDS, TERRAINS, type TileImage, type TileSource } from './tiles.js';

// ESM 里没有 require；pngjs 也没有类型，这里只用到同步读
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs') as {
  PNG: { sync: { read: (buffer: Buffer) => { width: number; height: number; data: Uint8Array } } };
};

function decode(file: string): TileImage | undefined {
  try {
    const png = PNG.sync.read(readFileSync(file));
    return { width: png.width, height: png.height, data: png.data };
  } catch {
    // 一张坏图不该让整次导出失败：没素材的那一块继续用程序瓦片
    return undefined;
  }
}

/**
 * 从美术目录里捡素材瓦片。
 *
 * 约定（导入脚本按这个写，导出器按这个读，两边不用互相知道对方存在）：
 *
 * ```
 * <artDir>/<kitId>/tiles/<terrain>[-<n>].png    地形，一个文件一个变体
 * <artDir>/<kitId>/props/<kind>.png             道具，透明底
 * ```
 *
 * 没有素材的地形/道具会留在 `source` 之外，`renderTileAtlas` 对它继续程序生成——
 * 所以素材可以一批一批接进来，不用等齐。
 */
export function loadTileSource(artDir: string | undefined, kitId: string): TileSource {
  const source: TileSource = {};
  if (!artDir) return source;
  const root = join(artDir, kitId);
  if (!existsSync(root)) return source;

  const tilesDir = join(root, 'tiles');
  if (existsSync(tilesDir)) {
    const files = readdirSync(tilesDir).filter((file) => file.endsWith('.png'));
    for (const terrain of TERRAINS) {
      // ground.png / ground-1.png / ground-2.png 都算同一个地形的变体，按名字排序保证确定性
      const matched = files
        .filter((file) => file === `${terrain}.png` || file.startsWith(`${terrain}-`))
        .sort()
        .map((file) => decode(join(tilesDir, file)))
        .filter((image): image is TileImage => Boolean(image));
      if (matched.length > 0) {
        source.terrain ??= {};
        source.terrain[terrain] = matched;
      }
    }
  }

  const propsDir = join(root, 'props');
  if (existsSync(propsDir)) {
    const files = new Set(readdirSync(propsDir).filter((file) => file.endsWith('.png')));
    for (const kind of PROP_KINDS) {
      const file = join(propsDir, `${kind}.png`);
      if (!files.has(`${kind}.png`)) continue;
      const image = decode(file);
      if (!image) continue;
      source.props ??= {};
      source.props[kind] = image;
    }
  }

  return source;
}

/** 有没有真的读到素材：摘要与自检用它区分"用了真美术"和"还是程序色块"。 */
export function describeTileSource(source: TileSource): { terrains: string[]; props: string[] } {
  const terrains = Object.entries(source.terrain ?? {})
    .filter(([, images]) => (images?.length ?? 0) > 0)
    .map(([terrain]) => terrain);
  const props = Object.keys(source.props ?? {});
  return { terrains, props };
}

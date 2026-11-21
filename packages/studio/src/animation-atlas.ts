import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { PNG } from 'pngjs';
import { assetIdFor, findAsset } from './assets.js';

export interface AnimationAtlasOptions {
  assetIds: string[];
  name?: string;
  fps?: number;
  loop?: boolean;
}

export interface AnimationAtlasResult {
  assetId: string;
  file: string;
  manifest: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
  loop: boolean;
}

export function createAnimationAtlas(
  root: string,
  options: AnimationAtlasOptions,
): AnimationAtlasResult {
  const ids = [...new Set(options.assetIds.filter((id) => typeof id === 'string'))];
  if (ids.length < 2) throw new Error('animation atlas requires at least two frames');
  const assets = ids.map((id) => findAsset(root, id));
  if (assets.some((asset) => !asset)) throw new Error('animation frame asset not found');
  const frames = assets.map((asset) => {
    const file = join(root, asset!.file);
    if (!file.toLowerCase().endsWith('.png')) {
      throw new Error(`animation atlas requires PNG frames: ${asset!.file}`);
    }
    return PNG.sync.read(readFileSync(file));
  });
  const frameWidth = frames[0].width;
  const frameHeight = frames[0].height;
  if (frames.some((frame) => frame.width !== frameWidth || frame.height !== frameHeight)) {
    throw new Error('animation frames must share the same dimensions');
  }

  const sheet = new PNG({ width: frameWidth * frames.length, height: frameHeight });
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    for (let y = 0; y < frameHeight; y += 1) {
      for (let x = 0; x < frameWidth; x += 1) {
        const source = (y * frameWidth + x) * 4;
        const target = (y * sheet.width + index * frameWidth + x) * 4;
        sheet.data[target] = frame.data[source];
        sheet.data[target + 1] = frame.data[source + 1];
        sheet.data[target + 2] = frame.data[source + 2];
        sheet.data[target + 3] = frame.data[source + 3];
      }
    }
  }

  const digest = createHash('sha1').update(ids.join(',')).digest('hex').slice(0, 10);
  const name = options.name?.trim() || 'Animation atlas';
  const slug = name
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'animation-atlas';
  const directory = join(root, '.gamedream', 'studio', 'generated');
  const file = join(directory, `${slug}-${digest}.png`);
  const manifest = join(directory, `${slug}-${digest}.json`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(file, PNG.sync.write(sheet));
  const metadata = {
    name,
    prompt: name,
    kind: 'animation-atlas',
    file: basename(file),
    frameWidth,
    frameHeight,
    frameCount: frames.length,
    fps: Math.max(1, Math.min(60, Math.trunc(options.fps ?? 8))),
    loop: options.loop !== false,
    frames: ids,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(manifest, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  const relativeFile = relative(root, file).split('\\').join('/');
  return {
    assetId: assetIdFor(relativeFile),
    file: relativeFile,
    manifest: relative(root, manifest).split('\\').join('/'),
    frameWidth,
    frameHeight,
    frameCount: frames.length,
    fps: metadata.fps,
    loop: metadata.loop,
  };
}

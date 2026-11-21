import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { PNG } from 'pngjs';
import { assetIdFor, findAsset } from './assets.js';
import { syncBuildAssets } from './assets.js';

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
  buildFile: string;
  webManifest: string;
  godotResource: string;
  index: string;
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

  const buildDirectory = join(root, 'game', 'build-assets', 'animations');
  mkdirSync(buildDirectory, { recursive: true });
  const buildName = `${slug}-${digest}`;
  const buildFile = join(buildDirectory, `${buildName}.png`);
  copyFileSync(file, buildFile);
  const descriptor = {
    image: `game/build-assets/animations/${buildName}.png`,
    frameWidth,
    frameHeight,
    frameCount: frames.length,
    fps: metadata.fps,
    loop: metadata.loop,
    animations: {
      idle: {
        frames: Array.from({ length: frames.length }, (_, index) => index),
        fps: metadata.fps,
        loop: metadata.loop,
      },
    },
  };
  const webManifest = join(buildDirectory, `${buildName}.web.json`);
  writeFileSync(webManifest, `${JSON.stringify(descriptor, null, 2)}\n`, 'utf8');
  const indexFile = join(buildDirectory, 'index.json');
  let index: { animations: Array<Record<string, unknown>> } = { animations: [] };
  try {
    const existing = JSON.parse(readFileSync(indexFile, 'utf8')) as { animations?: unknown };
    if (Array.isArray(existing.animations)) {
      index.animations = existing.animations.filter(
        (entry) => entry && (entry as Record<string, unknown>).name !== name,
      ) as Array<Record<string, unknown>>;
    }
  } catch {
    // A missing or malformed index is rebuilt from this atlas.
  }
  index.animations.push({
    name,
    image: descriptor.image,
    descriptor: relative(root, webManifest).split('\\').join('/'),
    frameWidth,
    frameHeight,
    frameCount: frames.length,
    fps: metadata.fps,
    loop: metadata.loop,
  });
  writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  const regions = Array.from({ length: frames.length }, (_, index) => [
    `[sub_resource type="AtlasTexture" id="AtlasTexture_${index + 1}"]`,
    'atlas = ExtResource("1")',
    `region = Rect2(${index * frameWidth}, 0, ${frameWidth}, ${frameHeight})`,
  ].join('\n')).join('\n\n');
  const frameRefs = Array.from(
    { length: frames.length },
    (_, index) => `{"duration": 1.0, "texture": SubResource("AtlasTexture_${index + 1}")}`,
  ).join(', ');
  const godotResource = join(buildDirectory, `${buildName}.tres`);
  writeFileSync(
    godotResource,
    [
      `[gd_resource type="SpriteFrames" load_steps=${frames.length + 2} format=3]`,
      '',
      `[ext_resource type="Texture2D" path="res://game/build-assets/animations/${buildName}.png" id="1"]`,
      '',
      regions,
      '',
      '[resource]',
      `animations = [{"frames": [${frameRefs}], "loop": ${metadata.loop ? 'true' : 'false'}, "name": "idle", "speed": ${metadata.fps}.0}]`,
      '',
    ].join('\n'),
    'utf8',
  );
  syncBuildAssets(root);

  const relativeFile = relative(root, file).split('\\').join('/');
  return {
    assetId: assetIdFor(relativeFile),
    file: relativeFile,
    manifest: relative(root, manifest).split('\\').join('/'),
    buildFile: relative(root, buildFile).split('\\').join('/'),
    webManifest: relative(root, webManifest).split('\\').join('/'),
    godotResource: relative(root, godotResource).split('\\').join('/'),
    index: relative(root, indexFile).split('\\').join('/'),
    frameWidth,
    frameHeight,
    frameCount: frames.length,
    fps: metadata.fps,
    loop: metadata.loop,
  };
}

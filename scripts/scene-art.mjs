#!/usr/bin/env node
// 为 kit 生成顶视建筑素材（占位美术），并导出一个带贴图的 Godot 场景用于检查。
// 换真实美术时：把同名 png 放进 kits/art/<kitId>/ 即可，导出会自动使用。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSceneWithTrace,
  exportGodotScene,
  loadKit,
  writeKitArtwork,
} from '../packages/scene/dist/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const kit = loadKit(join(root, 'packages/scene/kits/village-euro.json'));
const artDir = resolve(join(root, 'packages/scene/kits/art'));
const outDir = resolve(join(root, 'dist/scene-art'));

mkdirSync(outDir, { recursive: true });
const manifest = writeKitArtwork(kit, artDir, { tileSize: 32 });
console.log(`素材：${manifest.entries.length} 张 -> ${artDir}`);
for (const entry of manifest.entries) {
  console.log(`  ${entry.file.padEnd(34)} ${entry.width}x${entry.height}`);
}

const spec = {
  id: 'riverbend',
  name: '河湾村',
  kind: 'village',
  kitId: kit.id,
  seed: 20261128,
  tileSize: 32,
  bounds: { width: 96, height: 80 },
  required: ['tavern', 'chapel', 'smithy'],
  decor: 0.5,
  water: 'river',
};
const { layout, validation } = buildSceneWithTrace(spec, kit);
const godot = exportGodotScene(layout, join(outDir, 'godot'), { artDir });
console.log(
  `\nGodot：${validation.pass ? 'pass' : 'fail'} buildings=${layout.buildings.length} `
  + `textures=${godot.summary.textures} -> ${join(outDir, 'godot')}`,
);
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

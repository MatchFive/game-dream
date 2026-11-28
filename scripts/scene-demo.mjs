#!/usr/bin/env node
// 生成一份示例场景：布局 JSON + 俯视 SVG + trace 记录，用于人眼评审与数据集样例。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendTrace,
  buildSceneWithTrace,
  exportGodotScene,
  loadKit,
  renderSceneSvg,
} from '../packages/scene/dist/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = resolve(root, 'dist/scene-demo');
const kit = loadKit(join(root, 'packages/scene/kits/village-euro.json'));

const cases = [
  {
    id: 'riverbend',
    name: '河湾村',
    kind: 'village',
    seed: 20261128,
    bounds: { width: 96, height: 80 },
    required: ['tavern', 'chapel', 'smithy'],
    decor: 0.5,
    water: 'river',
  },
  {
    id: 'stonecross',
    name: '石十字镇',
    kind: 'town',
    seed: 424242,
    bounds: { width: 120, height: 96 },
    required: ['market-hall', 'chapel', 'tavern'],
    decor: 0.7,
    water: 'pond',
  },
  {
    id: 'lakeside',
    name: '湖畔小村',
    kind: 'camp',
    seed: 7,
    bounds: { width: 56, height: 48 },
    required: ['smithy'],
    decor: 0.35,
    water: 'pond',
  },
];

mkdirSync(outDir, { recursive: true });
const traceFile = join(outDir, 'scenes.jsonl');
writeFileSync(traceFile, '', 'utf8');

for (const scene of cases) {
  const spec = { ...scene, kitId: kit.id, tileSize: 32 };
  const { layout, validation, trace } = buildSceneWithTrace(spec, kit, { origin: 'solver' });
  writeFileSync(join(outDir, `${scene.id}.svg`), renderSceneSvg(layout), 'utf8');
  writeFileSync(join(outDir, `${scene.id}.json`), `${JSON.stringify(layout, null, 2)}\n`, 'utf8');
  const godot = exportGodotScene(layout, join(outDir, 'godot', scene.id), { artStyle: 'billboard' });
  appendTrace(traceFile, trace);
  const status = validation.pass ? 'PASS' : `FAIL(${validation.issues.map((i) => i.code).join(',')})`;
  console.log(
    `${scene.id.padEnd(12)} ${status.padEnd(8)} buildings=${String(layout.buildings.length).padStart(2)} `
    + `props=${String(layout.props.length).padStart(3)} density=${validation.metrics.density} `
    + `entrance=${validation.metrics.entranceCoverage} hash=${trace.output.layoutHash.slice(0, 8)} `
    + `godot=${godot.summary.buildings}buildings/${godot.summary.prefabs}prefabs/${godot.summary.tiles.roadCells}tiles`,
  );
}
console.log(`\n输出目录 ${outDir}`);

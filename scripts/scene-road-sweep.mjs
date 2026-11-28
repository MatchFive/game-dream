#!/usr/bin/env node
// 路网参数回归：拿一份**真模型产出的**场景 spec，只改 roads 三档，导出三个工程对比。
//
// 为什么这样做：`roads` 是 S14 加的参数，需要一个受控对照才能看出"宽街 / 默认 / 窄街"
// 到底差在哪。but 受控对照不等于自己编场景——基准 spec 从真实 trace 里取（agent 产出），
// 脚本只替换 roads 这一段。产物落在 dist/ 下，是构建输出，不是仓库里的游戏内容。
//
//   node scripts/scene-road-sweep.mjs --from docs/evidence/s14-roads/traces-rerun.jsonl \
//     --pick 主路宽阔 --out dist/s14-sweep
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSceneWithTrace,
  exportGodotScene,
  loadKit,
  parseSceneSpec,
  renderSceneSvg,
} from '../packages/scene/dist/index.js';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const root = fileURLToPath(new URL('..', import.meta.url));
const from = resolve(arg('from', join(root, 'docs/evidence/s14-roads/traces-rerun.jsonl')));
const pick = arg('pick', '主路宽阔');
const out = resolve(arg('out', join(root, 'dist/s14-sweep')));
const kit = loadKit(join(root, 'packages/scene/kits/village-euro.json'));

if (!existsSync(from)) {
  console.log(`missing traces: ${from}`);
  process.exit(3);
}

const lines = readFileSync(from, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
const trace = lines.find((line) => (line.prompt ?? '').includes(pick)) ?? lines[0];
const base = parseSceneSpec({ ...trace.spec, kitId: kit.id });
console.log(`base: ${base.name} ${base.bounds.width}x${base.bounds.height} seed=${base.seed} kind=${base.kind}`);
console.log(`  from: "${(trace.prompt ?? '').slice(0, 40)}"`);

const variants = [
  { name: 'narrow', roads: { mainWidth: 2, streetWidth: 1, spacing: 13 } },
  { name: 'default', roads: { mainWidth: 4, streetWidth: 2, spacing: 18 } },
  { name: 'wide', roads: { mainWidth: 6, streetWidth: 3, spacing: 22 } },
];

mkdirSync(out, { recursive: true });
for (const variant of variants) {
  const spec = parseSceneSpec({ ...base, id: `sweep-${variant.name}`, roads: variant.roads });
  const built = buildSceneWithTrace(spec, kit, { origin: 'solver' });
  const dir = join(out, variant.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'layout.json'), `${JSON.stringify(built.layout, null, 2)}\n`, 'utf8');
  writeFileSync(join(dir, 'scene.svg'), renderSceneSvg(built.layout), 'utf8');
  const exported = exportGodotScene(built.layout, join(dir, 'godot'), { kit, artStyle: 'tile' });

  const typology = built.layout.buildings.reduce((acc, building) => {
    acc[building.typology] = (acc[building.typology] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    [
      `${variant.name.padEnd(8)}`,
      `main=${variant.roads.mainWidth}`,
      `street=${variant.roads.streetWidth}`,
      `spacing=${variant.roads.spacing}`,
      `buildings=${built.layout.buildings.length}`,
      `streetWall=${typology['street-wall'] ?? 0}`,
      `courtyard=${typology.courtyard ?? 0}`,
      `roads=${built.layout.roads.length}`,
      `interactions=${built.validation.metrics.interactions ?? 0}`,
      `pass=${built.validation.pass}`,
      `files=${exported.files.length}`,
    ].join(' '),
  );
  if (!built.validation.pass) {
    console.log(`  issues: ${built.validation.issues.map((issue) => issue.code).join(',')}`);
  }
}
console.log(`out=${out}`);

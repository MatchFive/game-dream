#!/usr/bin/env node
// 用真实批次数据把 badcase 看板灌满，方便本地看效果 / 拍证据。
//
// 数据来源是 `docs/evidence/scene-batch/traces-v2.jsonl`（真模型的 25 条需求），
// 用当前求解器重放一遍再落成 Studio 场景；另外补四份"地图装不下需求"的极端 spec，
// 让闸门那一栏也有真实的失败样本（不是造假的标签，是求解器今天真的会这么失败）。
//
//   node scripts/scene-insights-demo.mjs --out dist/insights-demo
//   node packages/cli/dist/index.js studio --path dist/insights-demo --port 4781
//   打开 http://127.0.0.1:4781/scenes/insights
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveScene } from '../packages/studio/dist/scenes.js';
import {
  buildSceneWithTrace,
  loadKit,
  parseSceneSpec,
  renderSceneSvg,
} from '../packages/scene/dist/index.js';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const root = fileURLToPath(new URL('..', import.meta.url));
const out = resolve(arg('out', join(root, 'dist/insights-demo')));
const traces = resolve(arg('from', join(root, 'docs/evidence/scene-batch/traces-v2.jsonl')));
const kit = loadKit(join(root, 'packages/scene/kits/village-euro.json'));

if (!existsSync(traces)) {
  console.log(`missing traces: ${traces}`);
  process.exit(3);
}
rmSync(join(out, '.gamedream', 'studio', 'scenes'), { recursive: true, force: true });

let seeded = 0;
const record = (spec, createdAt, review) => {
  const built = buildSceneWithTrace(spec, kit, { origin: 'agent' });
  const id = spec.id.slice(0, 64).replace(/[^a-z0-9-]/g, '-');
  saveScene(out, {
    id,
    name: spec.name,
    createdAt,
    spec,
    layout: built.layout,
    validation: built.validation,
    svg: renderSceneSvg(built.layout),
    traceId: built.trace.id,
    attempts: 1,
    review,
  });
  seeded += 1;
};

const lines = readFileSync(traces, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
const seen = new Set();
for (const [index, trace] of lines.entries()) {
  const raw = trace.spec;
  if (!raw || raw.id === 'invalid' || seen.has(raw.id)) continue;
  seen.add(raw.id);
  let spec;
  try {
    spec = parseSceneSpec({ ...raw, kitId: kit.id });
  } catch {
    continue; // 当年就没通过 schema 的样本，今天也重放不了
  }
  record(
    spec,
    trace.createdAt ?? new Date(Date.UTC(2026, 10, 28, 8, 0, index)).toISOString(),
    // 混入少量"人工判差"，让看板能显示 bad 计数
    index % 7 === 3 ? { verdict: 'bad', notes: '重放时人工判差', at: new Date().toISOString() } : undefined,
  );
}

// 地图容量装不下需求：这是求解器今天真的会失败的一类，不是伪造的标签
const tight = [
  { id: 'scene-too-tight-camp', name: '26×24 营地（超出容量）', kind: 'camp', bounds: { width: 26, height: 24 }, required: ['chapel', 'market-hall', 'tavern'] },
  { id: 'scene-too-tight-village', name: '24×24 村（四条必需）', kind: 'village', bounds: { width: 24, height: 24 }, required: ['house-small', 'house-long', 'smithy', 'tavern'] },
  { id: 'scene-too-tight-cliff', name: '30×24 崖台（三级台阶）', kind: 'camp', bounds: { width: 30, height: 24 }, required: ['chapel'], elevation: { levels: 3, step: 5, from: 'north' } },
  { id: 'scene-too-tight-coast', name: '28×26 海岸镇（海吃掉一半）', kind: 'town', bounds: { width: 28, height: 26 }, required: ['market-hall'], water: 'coast' },
];
for (const [index, entry] of tight.entries()) {
  const spec = parseSceneSpec({
    id: entry.id,
    name: entry.name,
    kitId: kit.id,
    kind: entry.kind,
    seed: 11,
    tileSize: 32,
    decor: 0.5,
    bounds: entry.bounds,
    required: entry.required,
    water: entry.water ?? 'none',
    ...(entry.elevation ? { elevation: entry.elevation } : {}),
  });
  record(
    spec,
    new Date(Date.UTC(2026, 10, 28, 9, 30, index)).toISOString(),
    entry.id === 'scene-too-tight-cliff' ? { verdict: 'bad', notes: '地图装不下需求', at: new Date().toISOString() } : undefined,
  );
}

const { sceneInsights } = await import('../packages/studio/dist/insights.js');
const insights = sceneInsights(out);
console.log(`seeded=${seeded} dir=${out}`);
console.log(`totals=${JSON.stringify(insights.totals)}`);
console.log(`issues=${insights.issues.map((cluster) => `${cluster.key}×${cluster.count}`).join(', ') || '(none)'}`);
console.log(`unmet=${insights.unmet.length} clusters, top=${insights.unmet.slice(0, 4).map((cluster) => `${cluster.key}×${cluster.count}`).join(', ')}`);

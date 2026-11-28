#!/usr/bin/env node
// 用真实批次数据把 badcase 看板灌满，方便本地看效果 / 拍证据。
//
// 数据来源是 `docs/evidence/scene-batch/traces-v2.jsonl`（真模型的 25 条需求），
// 用当前求解器重放一遍再落成 Studio 场景。
//
// 失败的样本**不自己编**：用 `--extra <traces.jsonl>` 再接一批真跑出来的 trace
// （比如"地图装不下需求"那一批），脚本只负责把 agent 的产物重放成看板数据。
//
//   node scripts/scene-insights-demo.mjs --out dist/insights-demo
//   node scripts/scene-insights-demo.mjs --out dist/insights-demo --extra dist/badcase/traces.jsonl
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
const extra = arg('extra', '');
const extraTraces = extra ? resolve(extra) : '';
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

// 额外批次：真跑出来的失败样本（例如"地图装不下需求"），原样重放
if (extraTraces) {
  if (!existsSync(extraTraces)) {
    console.log(`missing extra traces: ${extraTraces}`);
    process.exit(3);
  }
  const extraLines = readFileSync(extraTraces, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  for (const [index, trace] of extraLines.entries()) {
    const raw = trace.spec;
    if (!raw || raw.id === 'invalid') continue;
    let spec;
    try {
      spec = parseSceneSpec({ ...raw, kitId: kit.id });
    } catch {
      continue;
    }
    // 加前缀避免和主批次撞 id（同一 prompt 重跑会得到同一个 spec.id）
    record(
      { ...spec, id: `extra-${spec.id}` },
      new Date(Date.UTC(2026, 10, 28, 10, 0, index)).toISOString(),
      undefined,
    );
  }
}

const { sceneInsights } = await import('../packages/studio/dist/insights.js');
const insights = sceneInsights(out);
console.log(`seeded=${seeded} dir=${out}`);
console.log(`totals=${JSON.stringify(insights.totals)}`);
console.log(`issues=${insights.issues.map((cluster) => `${cluster.key}×${cluster.count}`).join(', ') || '(none)'}`);
console.log(`unmet=${insights.unmet.length} clusters, top=${insights.unmet.slice(0, 4).map((cluster) => `${cluster.key}×${cluster.count}`).join(', ')}`);

#!/usr/bin/env node
// 用 scripted provider 造一批场景 trace（管线与真实模型完全一致，只有模型是桩），
// 然后跑 dataset 统计，验证"trace → 数据集"这条链路。
// 真实使用时把 provider 换成 createProvider({kind:'auto'})。
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKit, runSceneAgent } from '../packages/scene/dist/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = resolve(root, 'dist/scene-dataset');
const traceFile = join(outDir, 'traces.jsonl');
const kit = loadKit(join(root, 'packages/scene/kits/village-euro.json'));

rmSync(outDir, { recursive: true, force: true });

const base = {
  kind: 'village',
  kitId: kit.id,
  tileSize: 32,
  decor: 0.5,
  water: 'river',
};

/** 每句需求：先给一版被闸门挡下的 spec，再给修正版 */
const cases = [
  {
    prompt: '河边的渔村，要酒馆、教堂和码头',
    bad: { ...base, id: 'fishing', name: 'Fishing village', seed: 11, bounds: { width: 88, height: 72 }, required: ['grand-cathedral', 'tavern'] },
    good: { ...base, id: 'fishing', name: 'Fishing village', seed: 11, bounds: { width: 88, height: 72 }, required: ['tavern', 'chapel', 'dock-house'] },
  },
  {
    prompt: '山脚的贸易小镇，要有集市和铁匠铺',
    bad: { ...base, id: 'trade', name: 'Trade town', kind: 'town', seed: 22, bounds: { width: 120, height: 96 }, required: ['market-hall', 'grand-bazaar'] },
    good: { ...base, id: 'trade', name: 'Trade town', kind: 'town', seed: 22, bounds: { width: 120, height: 96 }, required: ['market-hall', 'smithy', 'tavern'] },
  },
  {
    prompt: '湖畔的猎人营地，只有铁匠铺和几间木屋',
    bad: { ...base, id: 'hunters', name: 'Hunters camp', kind: 'camp', seed: 33, bounds: { width: 56, height: 48 }, required: ['grand-cathedral'] },
    good: { ...base, id: 'hunters', name: 'Hunters camp', kind: 'camp', seed: 33, bounds: { width: 56, height: 48 }, required: ['smithy'], water: 'pond' },
  },
];

let emitted = 0;
for (const item of cases) {
  const replies = [JSON.stringify(item.bad), JSON.stringify(item.good)];
  let index = 0;
  const provider = {
    name: 'scripted',
    async complete() {
      const reply = replies[Math.min(index, replies.length - 1)];
      index += 1;
      return reply;
    },
  };
  const result = await runSceneAgent({
    prompt: item.prompt,
    kit,
    provider,
    maxAttempts: 3,
    traceFile,
  });
  emitted += result.traces.length;
  console.log(
    `${item.prompt.slice(0, 14)}… attempts=${result.attempts.length} finished=${result.finished} `
    + `issues=${result.traces.map((trace) => (trace.validation.pass ? 'pass' : trace.validation.issues.map((i) => i.code).join('+'))).join(' → ')}`,
  );
}

console.log(`\ntraces: ${emitted} -> ${traceFile}`);

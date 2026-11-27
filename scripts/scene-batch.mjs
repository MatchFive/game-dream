#!/usr/bin/env node
// 批量跑场景需求：每条 prompt 走一遍 agent（失败回喂重试），trace 累积到一个文件，
// 结束后直接出统计。有 OPENAI_API_KEY 时用真模型，没有时用离线启发式基线（--provider fake）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProvider } from '../packages/agent/dist/index.js';
import {
  loadKit,
  readTraces,
  runSceneAgent,
  summarize,
} from '../packages/scene/dist/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const promptFile = resolve(arg('prompts', join(root, 'scripts/scene-prompts.txt')));
const outDir = resolve(arg('out', join(root, 'dist/scene-batch')));
const providerKind = arg('provider', process.env.OPENAI_API_KEY ? 'auto' : 'fake');
const limit = Number(arg('limit', '0')) || 0;
const attempts = Number(arg('attempts', '3')) || 3;

const kit = loadKit(join(root, 'packages/scene/kits/village-euro.json'));
const traceFile = join(outDir, 'traces.jsonl');
const append = process.argv.includes('--append');
mkdirSync(outDir, { recursive: true });
// 默认每次跑干净的一份，避免上一次的样本混进统计（要累积就加 --append）
if (!append) writeFileSync(traceFile, '', 'utf8');

const prompts = readFileSync(promptFile, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .slice(0, limit > 0 ? limit : undefined);

/**
 * 离线启发式基线：把一句中文需求映射成合理的 SceneSpec。
 * 它不是模型，只用来在没有 key 时验证管线与产出可读的数据；有 key 时不会被用到。
 */
function heuristicProvider() {
  const pick = (userMessage) => {
    // agent 的 user 消息是"需求 + kit 说明 + 约束"，这里只取需求那一行
    const marker = 'Player-facing request:';
    const rest = userMessage.includes(marker) ? userMessage.split(marker)[1] ?? '' : userMessage;
    const prompt = (rest.split('\n').find((line) => line.trim()) ?? '').trim();
    const kind = /城池|王都|城市/.test(prompt)
      ? 'city'
      : /镇|要塞|驿站/.test(prompt)
        ? 'town'
        : /营地|哨站|驿站|关卡|补给/.test(prompt) ? 'camp' : 'village';
    const bounds = kind === 'city'
      ? { width: 148, height: 116 }
      : kind === 'town'
        ? { width: 120, height: 96 }
        : kind === 'camp'
          ? { width: 56, height: 48 }
          : { width: 96, height: 80 };
    const required = [];
    if (/酒馆/.test(prompt)) required.push('tavern');
    if (/教堂|隐修|学院/.test(prompt)) required.push('chapel');
    if (/铁匠|矿/.test(prompt)) required.push('smithy');
    if (/集市|市集|市场/.test(prompt)) required.push('market-hall');
    if (/码头|港|渔/.test(prompt)) required.push('dock-house');
    if (required.length === 0) required.push('tavern');
    const water = /河|湖|水乡|渔|绿洲|沼泽|泉|沿海/.test(prompt)
      ? 'river'
      : /不要水域|无水/.test(prompt) ? 'none' : 'pond';
    const seed = [...prompt].reduce((sum, char) => (sum * 31 + char.codePointAt(0)) % 2000000000, 7);
    return {
      id: `scene-${seed.toString(36)}`,
      name: prompt.slice(0, 24),
      kind,
      kitId: kit.id,
      seed,
      tileSize: 32,
      bounds,
      required: required.slice(0, 4),
      decor: kind === 'camp' ? 0.35 : 0.5,
      water,
      notes: 'offline heuristic baseline',
    };
  };

  return {
    name: 'heuristic',
    async complete(request) {
      return JSON.stringify(pick(request.user));
    },
  };
}

// 没有 key 时不要假装在跑模型：那会让"模型输出不合格"变成假的失败样本
if (providerKind !== 'fake' && !process.env.OPENAI_API_KEY) {
  console.error(`provider=${providerKind} 需要 OPENAI_API_KEY，但环境里没有。`);
  console.error('离线自测请用 --provider fake（跑启发式基线，产出的是基线样本，不是模型样本）。');
  process.exit(2);
}

let provider;
try {
  provider = providerKind === 'fake' ? heuristicProvider() : createProvider({ kind: providerKind, env: process.env });
} catch (error) {
  console.error(`无法创建 provider（${providerKind}）：${error.message}`);
  console.error('没有 OPENAI_API_KEY 时用 --provider fake 跑离线基线。');
  process.exit(2);
}
console.log(`provider=${provider.name} prompts=${prompts.length} out=${outDir}${append ? ' (append)' : ''}\n`);

let ok = 0;
let failed = 0;
for (const [index, prompt] of prompts.entries()) {
  const started = Date.now();
  try {
    const result = await runSceneAgent({
      prompt,
      kit,
      provider,
      maxAttempts: attempts,
      traceFile,
    });
    if (result.finished) ok += 1;
    else failed += 1;
    const last = result.attempts[result.attempts.length - 1];
    const issue = result.finished ? 'pass' : (result.failure ?? 'failed');
    console.log(
      `${String(index + 1).padStart(2)}/${prompts.length} ${result.finished ? 'OK  ' : 'FAIL'} `
      + `attempts=${result.attempts.length} buildings=${last?.layout.buildings.length ?? 0} `
      + `density=${last?.validation.metrics.density ?? '-'} ${issue} ${Date.now() - started}ms`,
    );
  } catch (error) {
    failed += 1;
    console.log(`${String(index + 1).padStart(2)}/${prompts.length} ERROR ${error.message}`);
  }
}

const { traces, skipped } = readTraces(traceFile);
const stats = summarize(traces);
writeFileSync(
  join(outDir, 'stats.json'),
  `${JSON.stringify({ provider: provider.name, prompts: promptFile, stats, skipped }, null, 2)}\n`,
  'utf8',
);

console.log(`\n完成：${ok} 通过 / ${failed} 未通过（共 ${prompts.length} 条需求）`);
console.log(`traces=${stats.total} skipped=${skipped} passRate=${((stats.passed / Math.max(1, stats.total)) * 100).toFixed(0)}%`);
console.log(`determinism=${stats.determinism.stable}/${stats.determinism.groups}`);
if (stats.issues.length > 0) {
  console.log(`failures: ${stats.issues.map((issue) => `${issue.code}×${issue.count}`).join(', ')}`);
}
console.log(`\n下一步：dream scene dataset --traces ${traceFile} --sft out/sft.jsonl --dpo out/dpo.jsonl`);
if (!existsSync(traceFile)) process.exitCode = 1;

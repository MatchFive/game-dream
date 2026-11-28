#!/usr/bin/env node
// 用 Studio 已配置的 ComfyUI 工作流，为 kit 里每个 prefab 生成一张正俯视贴图，
// 落到 <project>/.gamedream/studio/art/<kitId>/<prefabId>.png。
// 每张图的 prompt 与 seed 都记进 manifest：素材本身也要可追溯。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../packages/core/dist/index.js';
import { loadKit } from '../packages/scene/dist/index.js';
import pngjs from '../packages/studio/node_modules/pngjs/lib/png.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const kit = loadKit(join(root, 'packages/scene/kits/village-euro.json'));

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const apiBase = arg('api', 'http://127.0.0.1:6399');
const projectDir = resolve(arg('project', join(root, 'dist/nav-verify/无尽仙途')));
const workflowId = arg('workflow', 'legacy-qwen');
const only = arg('only', '');
const artDir = resolve(arg('out', join(projectDir, '.gamedream', 'studio', 'art', kit.id)));

/**
 * 全套共用同一段风格描述：只有"屋顶类型 + 材质"逐张变化，
 * 光照、笔触、饱和度、轮廓处理都锁死，否则七张图会像三套素材。
 */
const STYLE_ANCHOR = [
  'hand-painted top-down map texture for a medieval village',
  'consistent art style across the whole set',
  'muted earthy palette of warm brown, olive green and cream',
  'soft ambient light from the upper left, gentle ambient occlusion',
  'clean silhouette, smooth cel shading, no harsh black outlines',
  'painted at the same level of detail as a small village building',
].join(', ');

const ROOF_WORDS = { gable: 'gabled', hip: 'hipped', flat: 'flat' };
const PAINT_WORDS = {
  'house-small': 'warm clay brown shingles',
  'house-long': 'weathered terracotta shingles',
  smithy: 'dark soot-stained wood shingles',
  tavern: 'reddish brown clay shingles',
  chapel: 'pale grey stone slate',
  'market-hall': 'tan thatch',
  'dock-house': 'grey-brown weathered planks',
};
const ROLE_WORDS = {
  house: 'small medieval village house',
  shop: 'medieval tavern building',
  workshop: 'medieval smithy workshop',
  civic: 'large medieval chapel with a bell tower',
  landmark: 'medieval market hall',
  dock: 'wooden dock warehouse',
};

function promptFor(prefab) {
  return [
    // 目标风格是"高位 3/4 视角"：屋顶占主体，同时露出正面墙——这样在俯视地图上
    // 建筑才有体积感，导出时按 billboard 处理（底边贴合 footprint，向上溢出）
    `hand-painted medieval ${ROLE_WORDS[prefab.role] ?? 'building'} seen from a high three-quarter angle`,
    'roof dominant, front wall visible with door and windows, whole building in frame',
    `${ROOF_WORDS[prefab.roof] ?? 'gabled'} roof of ${PAINT_WORDS[prefab.id] ?? 'brown shingles'}`,
    STYLE_ANCHOR,
    'transparent background, isolated building, no ground, no cast shadow, no people, no text, centered',
  ].join(', ');
}

/** 按 alpha 裁掉透明边距，左右留 2px，避免贴图缩放后建筑缩水。 */
function trimTransparent(buffer) {
  let decoded;
  try {
    decoded = pngjs.PNG.sync.read(buffer);
  } catch {
    return { buffer, trimmed: null };
  }
  const { width, height, data } = decoded;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 8) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0 || (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1)) {
    return { buffer, trimmed: null };
  }
  const pad = 2;
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const w = Math.min(width - x0, maxX - minX + 1 + pad * 2);
  const h = Math.min(height - y0, maxY - minY + 1 + pad * 2);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    data.copy(out, y * w * 4, ((y0 + y) * width + x0) * 4, ((y0 + y) * width + x0 + w) * 4);
  }
  return { buffer: encodePng(w, h, out), trimmed: { width: w, height: h } };
}

async function api(path, init) {
  const response = await fetch(`${apiBase}${path}`, init);
  if (!response.ok) throw new Error(`${path} -> ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response;
}

async function waitJob(id) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const { job } = await (await api(`/api/jobs/${id}`)).json();
    if (job.status === 'done') return job;
    if (job.status === 'error') throw new Error(job.error ?? 'generation failed');
    await new Promise((done) => setTimeout(done, 2000));
  }
  throw new Error('generation timed out');
}

mkdirSync(artDir, { recursive: true });
const targets = kit.prefabs.filter((prefab) => !only || prefab.id === only);
console.log(`工作流 ${workflowId} → ${artDir}（${targets.length} 个 prefab）\n`);

const entries = [];
for (const prefab of targets) {
  const prompt = promptFor(prefab);
  const started = Date.now();
  const submitted = await (
    await api('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // /api/generate 目前不接受 seed（每个 job 内部随机），风格一致性只能靠提示词锚
      body: JSON.stringify({ prompt, count: 1, transparent: true, workflowId }),
    })
  ).json();
  const job = await waitJob(submitted.job.id);
  const raw = Buffer.from(await (await api(`/api/assets/${job.assetId}/raw`)).arrayBuffer());
  const { buffer, trimmed } = trimTransparent(raw);
  const file = `${prefab.id}.png`;
  writeFileSync(join(artDir, file), buffer);
  entries.push({
    prefab: prefab.id,
    file: `${kit.id}/${file}`,
    prompt,
    seed: job.seed,
    model: 'qwen_image_2.1_int8_convrot.safetensors',
    workflow: workflowId,
    bytes: buffer.byteLength,
    trimmed,
  });
  console.log(
    `${prefab.id.padEnd(14)} ${String(buffer.byteLength).padStart(8)}B `
    + `${trimmed ? `${trimmed.width}x${trimmed.height}` : 'no-trim'} ${Date.now() - started}ms`,
  );
}

writeFileSync(
  join(artDir, '..', `${kit.id}.ai-manifest.json`),
  `${JSON.stringify({ kitId: kit.id, workflow: workflowId, generatedAt: new Date().toISOString(), entries }, null, 2)}\n`,
  'utf8',
);
console.log(`\n完成 ${entries.length} 张 → ${artDir}`);

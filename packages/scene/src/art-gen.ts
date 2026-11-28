import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Kit, Prefab } from './schema.js';

/**
 * 建筑美术生成：把"每个 prefab 出一张 3/4 视角贴图"这件事做成项目能力。
 *
 * 以前这是 `scripts/scene-art-ai.mjs` 里的一次性脚本，靠人手工跑、再手工检查——
 * 按 docs/boundaries.md，美术属于游戏实现，必须由项目侧的能力产出，而不是
 * 编码 agent 手工跑脚本。所以流程搬到这里：CLI（`dream scene art`）、
 * 项目 agent、Studio 都可以调用同一份实现。
 */

const require = createRequire(import.meta.url);
// pngjs 没有自带类型；用它只为按 alpha 裁边
const { PNG } = require('pngjs') as {
  PNG: {
    sync: {
      read(buffer: Buffer): { width: number; height: number; data: Buffer };
      write(image: { width: number; height: number; data: Buffer }): Buffer;
    };
  };
};

export interface ArtPromptOptions {
  /** 全套共用的风格锚；不传用内置的中世纪村庄风格 */
  styleAnchor?: string;
}

const STYLE_ANCHOR = [
  'hand-painted top-down map texture for a medieval village',
  'consistent art style across the whole set',
  'muted earthy palette of warm brown, olive green and cream',
  'soft ambient light from the upper left, gentle ambient occlusion',
  'clean silhouette, smooth cel shading, no harsh black outlines',
  'painted at the same level of detail as a small village building',
].join(', ');

const ROOF_WORDS: Record<string, string> = { gable: 'gabled', hip: 'hipped', flat: 'flat' };

const PAINT_WORDS: Record<string, string> = {
  'house-small': 'warm clay brown shingles',
  'house-long': 'weathered terracotta shingles',
  smithy: 'dark soot-stained wood shingles',
  tavern: 'reddish brown clay shingles',
  chapel: 'pale grey stone slate',
  'market-hall': 'tan thatch',
  'dock-house': 'grey-brown weathered planks',
};

const ROLE_WORDS: Record<string, string> = {
  house: 'small medieval village house',
  shop: 'medieval tavern building',
  workshop: 'medieval smithy workshop',
  civic: 'large medieval chapel with a bell tower',
  landmark: 'medieval market hall',
  dock: 'wooden dock warehouse',
};

/**
 * 生成给模型的提示词。
 *
 * 目标是"高位 3/4 视角"而不是正俯视：正俯视在平面地图上像一块贴纸，
 * 而 3/4 能同时看到屋顶和正面墙，导出时按 billboard 排（底边贴 footprint、向上溢出）。
 */
export function artPromptFor(prefab: Prefab, options: ArtPromptOptions = {}): string {
  const anchor = options.styleAnchor ?? STYLE_ANCHOR;
  return [
    `hand-painted medieval ${ROLE_WORDS[prefab.role] ?? 'building'} seen from a high three-quarter angle`,
    'roof dominant, front wall visible with door and windows, whole building in frame',
    `${ROOF_WORDS[prefab.roof] ?? 'gabled'} roof of ${PAINT_WORDS[prefab.id] ?? 'brown shingles'}`,
    anchor,
    'transparent background, isolated building, no ground, no cast shadow, no people, no text, centered',
  ].join(', ');
}

// ---------------------------------------------------------------- workflow

export type WorkflowGraph = Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;

export interface WorkflowBinding {
  node: string;
  input: string;
}

export interface ArtWorkflow {
  graph: WorkflowGraph;
  /** 提示词要写进哪些字段。Qwen 工作流有两个：直出与"改写后"分支 */
  prompt: WorkflowBinding[];
  seed?: WorkflowBinding;
  output: { node: string; field?: string };
}

/**
 * 从工作流里推断注入点。
 *
 * 不硬编码节点 id：用户重新导出工作流，id 就变了。规则是
 * "带着文本输入的 TextGenerate" + "交换节点的 on_false 兜底分支"，
 * 这两个正是 Qwen 系列 t2i 工作流存提示词的位置。
 */
export function detectWorkflow(graph: WorkflowGraph): ArtWorkflow {
  const entries = Object.entries(graph);
  const prompt: WorkflowBinding[] = [];

  for (const [node, value] of entries) {
    const cls = value.class_type ?? '';
    const inputs = value.inputs ?? {};
    if (/TextGenerate/.test(cls) && typeof inputs.prompt === 'string') {
      prompt.push({ node, input: 'prompt' });
    }
    if (/Switch/.test(cls) && typeof inputs.on_false === 'string') {
      prompt.push({ node, input: 'on_false' });
    }
  }
  if (prompt.length === 0) {
    // 兜底：任何把提示词存成字符串的节点
    for (const [node, value] of entries) {
      const inputs = value.inputs ?? {};
      if (typeof inputs.prompt === 'string') prompt.push({ node, input: 'prompt' });
    }
  }
  if (prompt.length === 0) {
    throw new Error('cannot find a prompt input in this workflow; pass --prompt-node <id>:<input>');
  }

  const seedEntry = entries.find(([, value]) => typeof value.inputs?.seed === 'number');
  const outputEntry = entries.find(([, value]) => /^Save/.test(value.class_type ?? ''));
  if (!outputEntry) {
    throw new Error('cannot find a Save* node in this workflow; pass --output-node <id>');
  }

  return {
    graph,
    prompt,
    seed: seedEntry ? { node: seedEntry[0], input: 'seed' } : undefined,
    output: { node: outputEntry[0], field: 'images' },
  };
}

/** 把提示词/种子写进图里；不修改入参，避免多次生成互相污染。 */
export function applyWorkflow(
  workflow: ArtWorkflow,
  values: { prompt: string; seed?: number },
): WorkflowGraph {
  const graph: WorkflowGraph = JSON.parse(JSON.stringify(workflow.graph));
  for (const binding of workflow.prompt) {
    const node = graph[binding.node];
    if (!node) continue;
    node.inputs = { ...(node.inputs ?? {}), [binding.input]: values.prompt };
  }
  if (values.seed !== undefined && workflow.seed) {
    const node = graph[workflow.seed.node];
    if (node) node.inputs = { ...(node.inputs ?? {}), [workflow.seed.input]: values.seed };
  }
  return graph;
}

/**
 * 注入"透明背景"分支。
 *
 * 模型本身不保证 alpha，Studio 里是给工作流加一段后处理：抠背景 → 反相蒙版 →
 * 与原图合成。这里做同样的事，但按图结构接线（找到 Save 的输入源），
 * 不依赖固定 id。要求 ComfyUI 装有 `birefnet` 抠图模型。
 */
export function applyTransparency(graph: WorkflowGraph, output: { node: string; field?: string }): WorkflowGraph {
  const patched: WorkflowGraph = JSON.parse(JSON.stringify(graph));
  const save = patched[output.node];
  const linked = save?.inputs?.[output.field ?? 'images'];
  if (!Array.isArray(linked) || typeof linked[0] !== 'string') {
    throw new Error(`cannot find the image source feeding output node ${output.node}`);
  }
  const source: [string, number] = [linked[0], Number(linked[1] ?? 0)];

  patched.gamedream_bg_model = {
    class_type: 'LoadBackgroundRemovalModel',
    inputs: { bg_removal_name: 'birefnet.safetensors' },
  };
  patched.gamedream_bg_mask = {
    class_type: 'RemoveBackground',
    inputs: { bg_removal_model: ['gamedream_bg_model', 0], image: source },
  };
  patched.gamedream_bg_invert = {
    class_type: 'InvertMask',
    inputs: { mask: ['gamedream_bg_mask', 0] },
  };
  patched.gamedream_alpha = {
    class_type: 'JoinImageWithAlpha',
    inputs: { image: source, alpha: ['gamedream_bg_invert', 0] },
  };
  save.inputs = { ...(save.inputs ?? {}), [output.field ?? 'images']: ['gamedream_alpha', 0] };
  return patched;
}

/** 透明分支需要提示词配合：只靠抠图，边缘会留一圈地面色。 */
export const TRANSPARENT_SUFFIX = ', transparent background, alpha channel, isolated subject';

// ---------------------------------------------------------------- comfyui

export interface ComfyClient {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  pollMs?: number;
  timeoutMs?: number;
}

export interface GeneratedImage {
  filename: string;
  subfolder: string;
  type: string;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function comfyFetch(client: ComfyClient, path: string, init?: RequestInit): Promise<Response> {
  const doFetch = client.fetchImpl ?? fetch;
  const response = await doFetch(`${client.baseUrl.replace(/\/$/, '')}${path}`, init);
  if (!response.ok) {
    throw new Error(`comfyui ${path} -> ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return response;
}

/** 提交一张图并等到产出，返回可下载的图片描述。 */
export async function runComfy(
  client: ComfyClient,
  graph: WorkflowGraph,
  output: { node: string; field?: string },
): Promise<GeneratedImage> {
  const submitted = await comfyFetch(client, '/prompt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: graph, client_id: 'gamedream-scene-art' }),
  });
  const body = (await submitted.json()) as {
    prompt_id?: string;
    error?: { message?: string };
    node_errors?: Record<string, { errors?: Array<{ message?: string }> }>;
  };
  if (!body.prompt_id) {
    const nodeDetail = Object.entries(body.node_errors ?? {})
      .map(([node, value]) => `${node}: ${(value.errors ?? []).map((e) => e.message).join('; ')}`)
      .join(' | ');
    throw new Error(`comfyui rejected the workflow: ${body.error?.message ?? 'unknown'} ${nodeDetail}`.trim());
  }

  const pollMs = client.pollMs ?? 1500;
  const deadline = Date.now() + (client.timeoutMs ?? 300_000);
  while (Date.now() < deadline) {
    const history = (await (await comfyFetch(client, `/history/${body.prompt_id}`)).json()) as Record<
      string,
      { outputs?: Record<string, { images?: GeneratedImage[] }>; status?: { status_str?: string; messages?: unknown } }
    >;
    const entry = history[body.prompt_id];
    if (entry?.outputs) {
      const images = entry.outputs[output.node]?.images ?? [];
      if (images.length > 0) return images[0];
    }
    if (entry?.status?.status_str === 'error') {
      throw new Error(`comfyui execution failed: ${JSON.stringify(entry.status.messages ?? {}).slice(0, 300)}`);
    }
    await sleep(pollMs);
  }
  throw new Error(`comfyui generation timed out after ${client.timeoutMs ?? 300_000}ms`);
}

export async function downloadImage(client: ComfyClient, image: GeneratedImage): Promise<Buffer> {
  const query = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder,
    type: image.type,
  });
  const response = await comfyFetch(client, `/view?${query.toString()}`);
  return Buffer.from(await response.arrayBuffer());
}

// ---------------------------------------------------------------- artwork

export interface TrimResult {
  buffer: Buffer;
  trimmed: { width: number; height: number } | null;
  size: { width: number; height: number };
}

/**
 * 按 alpha 裁掉透明边距，四周留 2px。
 * 模型习惯把主体画在画面中央、四周大量留白，不裁的话建筑比格子小一圈。
 */
export function trimTransparent(buffer: Buffer): TrimResult {
  const decoded = PNG.sync.read(buffer);
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
  const size = { width, height };
  if (maxX < 0 || (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1)) {
    return { buffer, trimmed: null, size };
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
  return { buffer: PNG.sync.write({ width: w, height: h, data: out }), trimmed: { width: w, height: h }, size };
}

export interface ArtManifestEntry {
  prefab: string;
  file: string;
  prompt: string;
  seed?: number;
  bytes: number;
  trimmed: { width: number; height: number } | null;
}

export interface ArtManifest {
  kitId: string;
  workflow: string;
  generatedAt: string;
  entries: ArtManifestEntry[];
}

export interface GenerateKitArtworkOptions {
  kit: Kit;
  /** 输出目录，约定 <outDir>/<kitId>/<prefab>.png */
  outDir: string;
  client: ComfyClient;
  workflow: ArtWorkflow;
  /** 只生成这些 prefab；不传就全量 */
  only?: string[];
  seed?: number;
  styleAnchor?: string;
  workflowLabel?: string;
  /** 生成带 alpha 的图（默认开）；关掉会把整块画布一起写出去 */
  transparent?: boolean;
  onProgress?: (event: { prefab: string; index: number; total: number; entry?: ArtManifestEntry }) => void;
}

/**
 * 为整套 kit 生成贴图并写 manifest。
 * 每张图的提示词与尺寸都记下来——素材本身也要可追溯，否则换了一套图没人知道怎么来的。
 */
export async function generateKitArtwork(options: GenerateKitArtworkOptions): Promise<ArtManifest> {
  const { kit, workflow, client } = options;
  const dir = join(options.outDir, kit.id);
  mkdirSync(dir, { recursive: true });

  const targets = kit.prefabs.filter((prefab) => !options.only || options.only.includes(prefab.id));
  if (targets.length === 0) throw new Error('no prefab matched --only');

  const entries: ArtManifestEntry[] = [];
  const transparent = options.transparent ?? true;
  for (const [index, prefab] of targets.entries()) {
    const base = artPromptFor(prefab, { styleAnchor: options.styleAnchor });
    const prompt = transparent ? `${base}${TRANSPARENT_SUFFIX}` : base;
    options.onProgress?.({ prefab: prefab.id, index, total: targets.length });

    let graph = applyWorkflow(workflow, { prompt, seed: options.seed });
    if (transparent) graph = applyTransparency(graph, workflow.output);
    const image = await runComfy(client, graph, workflow.output);
    const raw = await downloadImage(client, image);
    const { buffer, trimmed } = trimTransparent(raw);

    const file = `${prefab.id}.png`;
    writeFileSync(join(dir, file), buffer);

    const entry: ArtManifestEntry = {
      prefab: prefab.id,
      file: `${kit.id}/${file}`,
      prompt,
      seed: options.seed,
      bytes: buffer.byteLength,
      trimmed,
    };
    entries.push(entry);
    options.onProgress?.({ prefab: prefab.id, index, total: targets.length, entry });
  }

  const manifest: ArtManifest = {
    kitId: kit.id,
    workflow: options.workflowLabel ?? 'custom',
    generatedAt: new Date().toISOString(),
    entries,
  };
  writeFileSync(join(options.outDir, `${kit.id}.art-manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

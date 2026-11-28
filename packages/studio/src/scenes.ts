import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createProvider } from '@gamedream/agent';
import {
  appendTrace,
  buildSceneWithTrace,
  exportGodotScene,
  findBuiltinKit,
  loadKit,
  parseSceneSpec,
  renderSceneSvg,
  runSceneAgent,
  writeKitArtwork,
  villageEuroKit,
  type Kit,
  type SceneLayout,
  type SceneSpec,
  type SceneValidation,
} from '@gamedream/scene';

export interface SceneReview {
  verdict: 'good' | 'acceptable' | 'bad';
  score?: number;
  notes?: string;
  at: string;
}

export interface StoredScene {
  id: string;
  name: string;
  createdAt: string;
  spec: SceneSpec;
  layout: SceneLayout;
  validation: SceneValidation;
  svg: string;
  traceId: string;
  attempts: number;
  review?: SceneReview;
}

export interface SceneSummary {
  id: string;
  name: string;
  createdAt: string;
  buildings: number;
  pass: boolean;
  issues: string[];
  attempts: number;
  review?: SceneReview;
}

export interface BuildSceneInput {
  spec?: unknown;
  prompt?: string;
  kitId?: string;
  kitPath?: string;
  seed?: number;
  attempts?: number;
  traceFile?: string;
  env?: NodeJS.ProcessEnv;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** 项目自带的美术素材目录：<project>/.gamedream/studio/art/<kitId>/<prefab>.png */
export function artDir(root: string): string {
  return join(root, '.gamedream', 'studio', 'art');
}

/**
 * 贴图引用：用稳定的 URL 而不是 base64 内嵌。
 * 一套 1024² 贴图内嵌会让 SVG 涨到几 MB，页面直接卡死。
 */
/** 读 PNG 头拿尺寸，billboard 模式按长宽比决定向上溢出多少。 */
function pngSizeOf(file: string): { width: number; height: number } | undefined {
  try {
    const buffer = readFileSync(file);
    if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') return undefined;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  } catch {
    return undefined;
  }
}

function artSizeFor(root: string, kitId: string): (prefab: string) => { width: number; height: number } | undefined {
  const dir = join(artDir(root), kitId);
  const cache = new Map<string, { width: number; height: number } | undefined>();
  return (prefab) => {
    if (!cache.has(prefab)) cache.set(prefab, pngSizeOf(join(dir, `${prefab}.png`)));
    return cache.get(prefab);
  };
}

function artUrlFor(root: string, kitId: string, prefabIds: Iterable<string>): (prefab: string) => string | undefined {
  const dir = join(artDir(root), kitId);
  const available = new Set<string>();
  if (existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.png')) available.add(file.slice(0, -4));
    }
  }
  const wanted = new Set(prefabIds);
  return (prefab) => (wanted.has(prefab) && available.has(prefab) ? `/api/scenes/art/${kitId}/${prefab}.png` : undefined);
}

/** 没有素材时生成一套占位美术，让预览与导出立刻有东西可用。 */
export function ensureArtwork(root: string, kit: Kit): { dir: string; count: number; created: boolean } {
  const dir = artDir(root);
  const kitDir = join(dir, kit.id);
  const existing = existsSync(kitDir) ? readdirSync(kitDir).filter((file) => file.endsWith('.png')).length : 0;
  if (existing > 0) return { dir: kitDir, count: existing, created: false };
  const manifest = writeKitArtwork(kit, dir, { tileSize: 32 });
  return { dir: kitDir, count: manifest.entries.length, created: true };
}

export function scenesDir(root: string): string {
  return join(root, '.gamedream', 'studio', 'scenes');
}

function sceneFile(root: string, id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error(`invalid scene id: ${id}`);
  return join(scenesDir(root), `${id}.json`);
}

export function resolveKit(input: BuildSceneInput): Kit {
  if (input.kitPath) return loadKit(input.kitPath);
  if (input.kitId) {
    const builtin = findBuiltinKit(input.kitId);
    if (!builtin) throw new Error(`unknown kit: ${input.kitId}`);
    return builtin;
  }
  return villageEuroKit;
}

function nextId(spec: SceneSpec): string {
  const base = spec.id.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'scene';
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `${base}-${stamp}`.slice(0, 64);
}

export function listScenes(root: string): SceneSummary[] {
  const dir = scenesDir(root);
  if (!existsSync(dir)) return [];
  const scenes: SceneSummary[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || file === 'traces.jsonl') continue;
    try {
      const scene = JSON.parse(readFileSync(join(dir, file), 'utf8')) as StoredScene;
      scenes.push({
        id: scene.id,
        name: scene.name,
        createdAt: scene.createdAt,
        buildings: scene.layout.buildings.length,
        pass: scene.validation.pass,
        issues: scene.validation.issues.map((issue) => issue.code),
        attempts: scene.attempts,
        review: scene.review,
      });
    } catch {
      // 坏文件跳过，不要让整个列表挂掉
    }
  }
  return scenes.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function loadScene(root: string, id: string): StoredScene | null {
  const file = sceneFile(root, id);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as StoredScene;
}

export function saveScene(root: string, scene: StoredScene): StoredScene {
  mkdirSync(scenesDir(root), { recursive: true });
  writeFileSync(sceneFile(root, scene.id), `${JSON.stringify(scene, null, 2)}\n`, 'utf8');
  return scene;
}

/**
 * 构建并落盘一个场景。有 spec 就直接求解；有 prompt 就走 agent（失败回喂重试）。
 * 每次尝试都写进 scenes/traces.jsonl —— 这就是 Studio 侧的数据集。
 */
export interface SceneBuildOutcome {
  scene: StoredScene;
  finished: boolean;
  failure?: string;
}

/**
 * 构建并落盘一个场景。有 spec 就直接求解；有 prompt 就走 agent（失败回喂重试）。
 * 每次尝试都写进 scenes/traces.jsonl —— 这就是 Studio 侧的数据集。
 * 闸门没过也照样落盘：失败的布局同样是可以评审、可以进 badcase 的样本。
 */
export async function buildScene(root: string, input: BuildSceneInput): Promise<SceneBuildOutcome> {
  const kit = resolveKit(input);
  const traceFile = input.traceFile ?? join(scenesDir(root), 'traces.jsonl');

  if (input.spec) {
    const spec = parseSceneSpec(input.spec);
    const built = buildSceneWithTrace(spec, kit, { origin: 'manual' });
    appendTrace(traceFile, built.trace);
    const scene = saveScene(root, {
      id: nextId(spec),
      name: spec.name,
      createdAt: new Date().toISOString(),
      spec,
      layout: built.layout,
      validation: built.validation,
      svg: renderSceneSvg(built.layout, {
        artUrl: artUrlFor(root, kit.id, built.layout.buildings.map((building) => building.prefab)),
        artSize: artSizeFor(root, kit.id),
        artStyle: 'billboard',
      }),
      traceId: built.trace.id,
      attempts: 1,
    });
    return { scene, finished: built.validation.pass };
  }

  if (!input.prompt?.trim()) throw new Error('send either a spec or a prompt');
  const provider = createProvider({ kind: 'auto', env: input.env ?? process.env });
  const agent = await runSceneAgent({
    prompt: input.prompt,
    kit,
    provider,
    seed: input.seed,
    maxAttempts: input.attempts ?? 3,
    traceFile,
  });

  // 全是解析失败时没有可展示的布局，直接报错，别存一个空场景
  const usable = agent.attempts.find((attempt) => attempt.layout.buildings.length > 0)
    ?? agent.attempts[agent.attempts.length - 1];
  if (!usable || usable.spec.id === 'invalid') {
    throw new Error(agent.failure ?? 'the model did not return a usable SceneSpec');
  }

  const scene = saveScene(root, {
    id: nextId(usable.spec),
    name: usable.spec.name,
    createdAt: new Date().toISOString(),
    spec: usable.spec,
    layout: agent.layout,
    validation: agent.validation,
    svg: renderSceneSvg(agent.layout, {
      artUrl: artUrlFor(root, kit.id, agent.layout.buildings.map((building) => building.prefab)),
      artSize: artSizeFor(root, kit.id),
      artStyle: 'billboard',
    }),
    traceId: agent.traces[agent.traces.length - 1]?.id ?? 'unknown',
    attempts: agent.attempts.length,
  });
  return { scene, finished: agent.finished, failure: agent.failure };
}

export interface SceneExportOutcome {
  /** 工程目录，可直接用 Godot 打开 */
  dir: string;
  files: number;
  summary: Record<string, unknown>;
}

export function exportsDir(root: string): string {
  return join(root, '.gamedream', 'studio', 'exports');
}

/**
 * 把已保存的场景导出成一个可编辑的引擎工程。
 *
 * 产物不是一个"截图式的成品"，而是能继续做下去的东西：地面是 TileMapLayer
 * （可逐格刷改），建筑是 prefabs/*.tscn 的实例（改一次全图生效），
 * 再加上碰撞、正门标记、导航网格与边界墙。
 *
 * 这个函数是项目能力的一部分：CLI 的 `dream scene build`、Studio 的导出按钮、
 * 以后 agent 的工具调用，走的都是同一个导出器。
 */
export function exportScene(
  root: string,
  id: string,
  options: { artStyle?: 'tile' | 'billboard' } = {},
): SceneExportOutcome {
  const scene = loadScene(root, id);
  if (!scene) throw new Error(`scene not found: ${id}`);
  const dir = join(exportsDir(root), id);
  const result = exportGodotScene(scene.layout, dir, {
    artDir: artDir(root),
    artStyle: options.artStyle ?? 'billboard',
  });
  return { dir, files: result.files.length, summary: result.summary };
}

export function reviewScene(
  root: string,
  id: string,
  review: { verdict: SceneReview['verdict']; score?: number; notes?: string },
): StoredScene {
  const scene = loadScene(root, id);
  if (!scene) throw new Error(`scene not found: ${id}`);
  scene.review = {
    verdict: review.verdict,
    score: review.score,
    notes: review.notes,
    at: new Date().toISOString(),
  };
  saveScene(root, scene);
  // 评审结果同时追加到 trace 流：训练数据里就是偏好标签
  appendTrace(join(scenesDir(root), 'traces.jsonl'), {
    schema: 1,
    id: `${scene.traceId}-review`,
    createdAt: new Date().toISOString(),
    origin: 'manual',
    spec: scene.spec,
    kit: { id: scene.spec.kitId, hash: 'review' },
    steps: [{ at: new Date().toISOString(), phase: 'revise', summary: `human review: ${review.verdict}` }],
    validation: scene.validation,
    output: {
      layoutHash: scene.traceId,
      buildings: scene.layout.buildings.length,
      props: scene.layout.props.length,
      lots: scene.layout.lots.length,
    },
    durationMs: 0,
    review: { verdict: review.verdict, score: review.score, notes: review.notes },
  });
  return scene;
}

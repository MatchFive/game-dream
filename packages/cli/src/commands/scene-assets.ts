import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildArtIndex,
  createOpenAIDescriber,
  findSprites,
  indexStats,
  pickPrefabArt,
  readIndex,
  writeIndex,
  writePrefabArt,
  type ArtIndex,
  type ArtQuery,
  type IndexedSprite,
} from '@gamedream/scene';
import { findBuiltinKit } from '@gamedream/scene';

/** 有 workspace 时把 Studio 设置里的模型配置合进 env（设置优先）。 */
async function withStudioEnv(
  workspace: string | undefined,
  base: NodeJS.ProcessEnv,
): Promise<NodeJS.ProcessEnv> {
  if (!workspace) return base;
  const { loadStudioSettings, studioEnv } = await import('@gamedream/studio');
  const settings = loadStudioSettings(resolve(workspace), base);
  return { ...base, ...studioEnv(settings) };
}

export interface SceneAssetsIndexOptions {
  source: string;
  outPath: string;
  /** 只处理这几张图集 */
  only?: string[];
  limit?: number;
  batch?: number;
  /** 从哪个套件取 prefab id（模型的建议必须落在这个集合里） */
  kitId?: string;
  /** 读这个工作区的 settings.json 拿模型配置 */
  workspace?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  onProgress?: (event: { sheet: string; done: number; total: number; batch: number; batches: number }) => void;
}

export interface SceneAssetsIndexResult {
  index: ArtIndex;
  file: string;
  stats: ReturnType<typeof indexStats>;
}

/**
 * 让视觉模型"看一遍"素材库，产出可查询的索引。
 *
 * 这一步的价值不在切图（切图是确定性的算法），在于**给每块图一个人能懂的语义**：
 * 模型把 96×96 的一块图认成"两层酒楼（红灯笼）"，之后设计器/agent 就能按语义检索，
 * 而不是让人翻 2 万张图找"哪个能当酒馆"。
 */
export async function sceneAssetsIndexCommand(
  options: SceneAssetsIndexOptions,
): Promise<SceneAssetsIndexResult> {
  const env = await withStudioEnv(options.workspace, options.env ?? process.env);
  const apiKey = options.apiKey ?? env.OPENAI_API_KEY;
  const baseUrl = options.baseUrl ?? env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const model = options.model ?? env.GAMEDREAM_VISION_MODEL ?? env.GAMEDREAM_MODEL;
  if (!apiKey || !model) {
    throw new Error('vision model not configured: set OPENAI_API_KEY and GAMEDREAM_VISION_MODEL (or --workspace <project>)');
  }
  const kit = options.kitId ? findBuiltinKit(options.kitId) : undefined;
  if (options.kitId && !kit) throw new Error(`unknown kit: ${options.kitId}`);

  const describer = createOpenAIDescriber({
    apiKey,
    baseUrl,
    model,
    fetchImpl: options.fetchImpl,
  });
  const index = await buildArtIndex({
    source: resolve(options.source),
    files: options.only,
    limit: options.limit,
    batch: options.batch,
    describer,
    prefabs: kit?.prefabs.map((prefab) => prefab.id) ?? [],
    onProgress: options.onProgress,
  });
  const file = writeIndex(resolve(options.outPath), index);
  return { index, file, stats: indexStats(index) };
}

export interface SceneAssetsFindOptions {
  indexPath: string;
  query: ArtQuery;
}

export function sceneAssetsFindCommand(options: SceneAssetsFindOptions): {
  sprites: IndexedSprite[];
  index: ArtIndex;
} {
  const index = readIndex(resolve(options.indexPath));
  return { sprites: findSprites(index, options.query), index };
}

export interface SceneAssetsApplyOptions {
  indexPath: string;
  /** 素材库根，用来回读原图 */
  source: string;
  artDir: string;
  kitId: string;
}

/**
 * 按索引里的模型建议，把每个 prefab 的立绘写进美术目录。
 *
 * 只写模型明确归到该 prefab 的（`kind=building` + prefab 命中），挑不到就空着——
 * 缺美术会立刻被发现，配错美术会在"这栋楼怎么长得像庙"上浪费一整轮。
 */
export function sceneAssetsApplyCommand(options: SceneAssetsApplyOptions): {
  picks: ReturnType<typeof pickPrefabArt>;
  files: string[];
  missing: string[];
} {
  const indexPath = resolve(options.indexPath);
  if (!existsSync(indexPath)) throw new Error(`art index not found: ${indexPath}`);
  const index = readIndex(indexPath);
  const kit = findBuiltinKit(options.kitId);
  if (!kit) throw new Error(`unknown kit: ${options.kitId}`);
  const prefabs = kit.prefabs.map((prefab) => ({
    id: prefab.id,
    // 期望的宽高比：footprint 区间的中值。素材是 96×96 的方正小楼，
    // 拿它当 9 格宽的联排长屋会被拉成一条，所以形态要参与排序。
    aspect: ((prefab.footprint.minWidth + prefab.footprint.maxWidth) / 2)
      / ((prefab.footprint.minHeight + prefab.footprint.maxHeight) / 2),
  }));
  const prefabIds = prefabs.map((prefab) => prefab.id);
  const picks = pickPrefabArt(index, prefabs);
  const files = writePrefabArt({
    index,
    source: resolve(options.source),
    artDir: resolve(options.artDir),
    kitId: options.kitId,
    picks,
  });
  const picked = new Set(picks.map((pick) => pick.prefab));
  const missing = prefabIds.filter((id) => !picked.has(id));
  return { picks, files, missing };
}

/** 索引的文本摘要：CLI 打印用，也可直接贴进 issue。 */
export function summarizeIndex(index: ArtIndex): string {
  const stats = indexStats(index);
  const kinds = Object.entries(stats.byKind)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => `${kind} ${count}`)
    .join(' · ');
  const prefabs = Object.entries(stats.prefabs)
    .sort((a, b) => b[1] - a[1])
    .map(([prefab, count]) => `${prefab} ${count}`)
    .join(' · ');
  return [
    `sheets ${stats.sheets} · sprites ${stats.sprites} · labelled ${stats.labelled} (${index.model})`,
    `kinds: ${kinds || '(none)'}`,
    `prefabs: ${prefabs || '(none)'}`,
  ].join('\n');
}

export function readIndexFile(path: string): ArtIndex {
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as ArtIndex;
}

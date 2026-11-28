import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createProvider, type ModelProvider, type ProviderKind } from '@gamedream/agent';
import { buildScene, exportScene, scenesDir } from '@gamedream/studio';
import {
  buildSceneWithTrace,
  exportGodotScene,
  findBuiltinKit,
  importTiles,
  loadKit,
  parseSceneSpec,
  renderSceneSvg,
  runSceneAgent,
  type Kit,
  type SceneLayout,
  type SceneValidation,
  type TileImportResult,
  type TilePicks,
} from '@gamedream/scene';

export interface SceneBuildOptions {
  prompt?: string;
  specPath?: string;
  kitPath: string;
  /** 独立工程出口（`--out`）；给了 projectPath 时不需要 */
  outDir?: string;
  seed?: number;
  attempts?: number;
  provider?: ProviderKind;
  providerImpl?: ModelProvider;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  /** 额外硬约束，透传给模型 */
  constraints?: string[];
  traceFile?: string;
  /** 建筑贴图目录（约定 <artDir>/<kitId>/<prefab>.png） */
  artDir?: string;
  /** tile 铺满足迹 / billboard 底边对齐向上溢出 */
  artStyle?: 'tile' | 'billboard';
  /**
   * 建到项目里：产物落 `<project>/game/scenes/<id>/`，与 Studio 的导出按钮走同一条路径。
   *
   * 给了它就不再需要 `--out`——场景属于项目，不是另开一个能单独打开的工程。
   */
  projectPath?: string;
  /** 场景目录名；不给则按 spec.id（可加序号）生成 */
  id?: string;
  /** 目录已存在时覆盖，而不是新开一个 `<id>-2` */
  replace?: boolean;
  onAttempt?: (index: number, layout: SceneLayout, validation: SceneValidation, finished: boolean) => void;
}

export interface SceneBuildResult {
  layout: SceneLayout;
  validation: SceneValidation;
  finished: boolean;
  attempts: number;
  failure?: string;
  traces: number;
  files: string[];
  /** 模型声明的"这份 format 做不到"的需求 */
  unmet: string[];
  /** 落进项目时的场景坐标（`--project` 才有） */
  scene?: {
    /** 场景目录名（对比 spec.id 可能带序号） */
    id: string;
    dir: string;
    /** 游戏侧 preload 的路径 */
    resPath: string;
    /** 场景索引文件 */
    index: string;
  };
}

/**
 * 建到项目里：求解 → 落盘 `game/scenes/<id>/scene.json` → 导出引擎文件 → 更新索引。
 *
 * 与 Studio 的导出按钮调用同一组函数（studio/src/scenes.ts），所以两条产品路径不会漂移。
 * 目录名默认取 `spec.id`；`--replace` 复用同一个目录，否则加序号（`plaza` → `plaza-2`），
 * 这样反复迭代不会把 `game/scenes/` 堆成一堆时间戳。
 */
async function sceneBuildIntoProject(options: SceneBuildOptions): Promise<SceneBuildResult> {
  const root = resolve(options.projectPath as string);
  if (!existsSync(root)) throw new Error(`project not found: ${root}`);
  const spec = options.specPath ? JSON.parse(readFileSync(options.specPath, 'utf8')) : undefined;
  if (!spec && !options.prompt?.trim()) throw new Error('either --prompt or --spec is required');

  // auto 时不在这里造 provider：交给 buildScene 用项目自己的设置（settings.json）
  const provider = options.providerImpl ?? (options.provider && options.provider !== 'auto'
    ? createProvider({ kind: options.provider, env: options.env ?? process.env, fetchImpl: options.fetchImpl })
    : undefined);

  const outcome = await buildScene(root, {
    spec,
    prompt: options.prompt,
    kitPath: options.kitPath,
    seed: options.seed,
    attempts: options.attempts,
    traceFile: options.traceFile,
    env: options.env,
    provider,
    id: options.id,
    // 有显式 --id 就听它的；否则用 spec.id 当目录名，而不是时间戳
    stableId: true,
    overwrite: options.replace,
    onAttempt: options.onAttempt,
  });
  const exported = exportScene(root, outcome.scene.id, {
    artStyle: options.artStyle ?? 'billboard',
    artDir: options.artDir ? resolve(options.artDir) : undefined,
  });
  const id = outcome.scene.id;
  return {
    layout: outcome.scene.layout,
    validation: outcome.scene.validation,
    finished: outcome.finished,
    failure: outcome.failure,
    attempts: outcome.scene.attempts,
    traces: outcome.scene.attempts,
    unmet: outcome.scene.spec.unmet,
    files: exported.list,
    scene: {
      id,
      dir: exported.dir,
      resPath: `res://game/scenes/${id}/scene.tscn`,
      index: join(scenesDir(root), 'index.json'),
    },
  };
}

function resolveKit(kitPath: string): Kit {
  // 内置套件可以按 id 直接给：`--kit village-cn`，省得记路径
  const builtin = findBuiltinKit(kitPath);
  if (builtin) return builtin;
  const path = resolve(kitPath);
  if (!existsSync(path)) throw new Error(`kit not found: ${path}`);
  return loadKit(path);
}

export interface SceneTilesImportOptions {
  /** 外部素材库根目录 */
  source: string;
  /** 选取表 JSON */
  picksPath: string;
  /** 素材落点，约定是 `<project>/.gamedream/studio/art` */
  artDir: string;
  tileSize?: number;
}

/**
 * 把素材库里的瓦片整理进项目的美术目录。
 *
 * 这一步是"素材接入"的产品入口：项目 agent 跑它，导出器随后就能读到真瓦片。
 * 选取表是数据（哪张图哪一格），产物是本地缓存（可重建），仓库里既不塞二进制，
 * 也不需要谁手工贴图。
 */
export function sceneTilesImportCommand(options: SceneTilesImportOptions): TileImportResult & { picks: string } {
  const picksPath = resolve(options.picksPath);
  if (!existsSync(picksPath)) throw new Error(`picks not found: ${picksPath}`);
  const picks = JSON.parse(readFileSync(picksPath, 'utf8')) as TilePicks;
  const result = importTiles({
    source: resolve(options.source),
    artDir: resolve(options.artDir),
    picks,
    tileSize: options.tileSize,
  });
  return { ...result, picks: picksPath };
}

function writeArtifacts(
  layout: SceneLayout,
  outDir: string,
  options: { artDir?: string; artStyle?: 'tile' | 'billboard'; kit?: Kit } = {},
): string[] {
  mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const layoutPath = join(outDir, 'layout.json');
  writeFileSync(layoutPath, `${JSON.stringify(layout, null, 2)}\n`, 'utf8');
  files.push(layoutPath);
  const svgPath = join(outDir, 'scene.svg');
  writeFileSync(svgPath, renderSceneSvg(layout), 'utf8');
  files.push(svgPath);
  // 直接产出可编辑的引擎工程：地面是 TileMapLayer，建筑是 prefab 实例
  const godotDir = join(outDir, 'godot');
  const godot = exportGodotScene(layout, godotDir, {
    artDir: options.artDir ? resolve(options.artDir) : undefined,
    artStyle: options.artStyle ?? 'billboard',
    // 透传 kit：prefab 上挂什么节点（门口灯、交互区）是 kit 说了算
    kit: options.kit,
  });
  return [...files, ...godot.files.map((file) => join(godotDir, file))];
}

/**
 * 有 prompt 就走模型出 spec（失败会把 issue 回喂重试）；
 * 有 spec 文件就直接构建。两者的产物与 trace 落盘方式一致。
 */
export async function sceneBuildCommand(options: SceneBuildOptions): Promise<SceneBuildResult> {
  if (options.projectPath) return sceneBuildIntoProject(options);
  const outDir = options.outDir;
  if (!outDir) throw new Error('either --out (standalone engine project) or --project (into a game project) is required');
  const kit = resolveKit(options.kitPath);
  let result: {
    layout: SceneLayout;
    validation: SceneValidation;
    finished: boolean;
    attempts: number;
    failure?: string;
    traces: number;
    unmet: string[];
  };

  if (options.specPath) {
    const spec = parseSceneSpec(JSON.parse(readFileSync(options.specPath, 'utf8')));
    const built = buildSceneWithTrace(spec, kit, { origin: 'manual' });
    if (options.traceFile) {
      const { appendTrace } = await import('@gamedream/scene');
      appendTrace(options.traceFile, built.trace);
    }
    result = {
      layout: built.layout,
      validation: built.validation,
      finished: built.validation.pass,
      attempts: 1,
      traces: 1,
      unmet: spec.unmet,
    };
  } else {
    if (!options.prompt?.trim()) throw new Error('either --prompt or --spec is required');
    const env = options.env ?? process.env;
    const provider = options.providerImpl ?? createProvider({
      kind: options.provider ?? 'auto',
      env,
      fetchImpl: options.fetchImpl,
    });
    const agent = await runSceneAgent({
      prompt: options.prompt,
      kit,
      provider,
      seed: options.seed,
      maxAttempts: options.attempts,
      constraints: options.constraints,
      traceFile: options.traceFile,
      onAttempt: (attempt, _trace) => {
        options.onAttempt?.(attempt.index, attempt.layout, attempt.validation, attempt.validation.pass);
      },
    });
    const lastAttempt = agent.attempts[agent.attempts.length - 1];
    result = {
      layout: agent.layout,
      validation: agent.validation,
      finished: agent.finished,
      attempts: agent.attempts.length,
      failure: agent.failure,
      traces: agent.traces.length,
      unmet: lastAttempt?.spec?.unmet ?? [],
    };
  }

  const files = result.finished
    ? writeArtifacts(result.layout, outDir, {
      artDir: options.artDir,
      artStyle: options.artStyle,
      kit: resolveKit(options.kitPath),
    })
    : [];
  return { ...result, files };
}

export interface SceneDatasetOptions {
  tracesPath: string;
  sftPath?: string;
  dpoPath?: string;
}

export interface SceneDatasetResult {
  stats: import('@gamedream/scene').DatasetStats;
  skipped: number;
  sft: number;
  dpo: number;
}

/**
 * trace → 数据集。统计用来判断"样本够不够、失败集中在哪里"，
 * 导出的 SFT / 偏好对则直接喂给训练。
 */
export async function sceneDatasetCommand(options: SceneDatasetOptions): Promise<SceneDatasetResult> {
  const scene = await import('@gamedream/scene');
  const { traces, skipped } = scene.readTraces(options.tracesPath);
  const stats = scene.summarize(traces);

  let sft = 0;
  if (options.sftPath) {
    const samples = scene.toSftSamples(traces, scene.SCENE_SYSTEM_PROMPT);
    writeFileSync(options.sftPath, samples.map((sample) => JSON.stringify(sample)).join('\n') + (samples.length ? '\n' : ''), 'utf8');
    sft = samples.length;
  }

  let dpo = 0;
  if (options.dpoPath) {
    const pairs = [...scene.toPreferencePairs(traces), ...scene.toReviewPairs(traces)];
    writeFileSync(options.dpoPath, pairs.map((pair) => JSON.stringify(pair)).join('\n') + (pairs.length ? '\n' : ''), 'utf8');
    dpo = pairs.length;
  }

  return { stats, skipped, sft, dpo };
}

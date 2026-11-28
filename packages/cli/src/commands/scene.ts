import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createProvider, type ModelProvider, type ProviderKind } from '@gamedream/agent';
import {
  buildSceneWithTrace,
  exportGodotScene,
  loadKit,
  parseSceneSpec,
  renderSceneSvg,
  runSceneAgent,
  type Kit,
  type SceneLayout,
  type SceneValidation,
} from '@gamedream/scene';

export interface SceneBuildOptions {
  prompt?: string;
  specPath?: string;
  kitPath: string;
  outDir: string;
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
}

function resolveKit(kitPath: string): Kit {
  const path = resolve(kitPath);
  if (!existsSync(path)) throw new Error(`kit not found: ${path}`);
  return loadKit(path);
}

function writeArtifacts(
  layout: SceneLayout,
  outDir: string,
  options: { artDir?: string; artStyle?: 'tile' | 'billboard' } = {},
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
  });
  return [...files, ...godot.files.map((file) => join(godotDir, file))];
}

/**
 * 有 prompt 就走模型出 spec（失败会把 issue 回喂重试）；
 * 有 spec 文件就直接构建。两者的产物与 trace 落盘方式一致。
 */
export async function sceneBuildCommand(options: SceneBuildOptions): Promise<SceneBuildResult> {
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
    ? writeArtifacts(result.layout, options.outDir, { artDir: options.artDir, artStyle: options.artStyle })
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

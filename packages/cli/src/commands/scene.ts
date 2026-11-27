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
}

function resolveKit(kitPath: string): Kit {
  const path = resolve(kitPath);
  if (!existsSync(path)) throw new Error(`kit not found: ${path}`);
  return loadKit(path);
}

function writeArtifacts(layout: SceneLayout, outDir: string): string[] {
  mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const layoutPath = join(outDir, 'layout.json');
  writeFileSync(layoutPath, `${JSON.stringify(layout, null, 2)}\n`, 'utf8');
  files.push(layoutPath);
  const svgPath = join(outDir, 'scene.svg');
  writeFileSync(svgPath, renderSceneSvg(layout), 'utf8');
  files.push(svgPath);
  const godotDir = join(outDir, 'godot');
  const godot = exportGodotScene(layout, godotDir);
  return [...files, ...godot.files.map((file) => join(godotDir, file))];
}

/**
 * 有 prompt 就走模型出 spec（失败会把 issue 回喂重试）；
 * 有 spec 文件就直接构建。两者的产物与 trace 落盘方式一致。
 */
export async function sceneBuildCommand(options: SceneBuildOptions): Promise<SceneBuildResult> {
  const kit = resolveKit(options.kitPath);
  let result: { layout: SceneLayout; validation: SceneValidation; finished: boolean; attempts: number; failure?: string; traces: number };

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
    result = {
      layout: agent.layout,
      validation: agent.validation,
      finished: agent.finished,
      attempts: agent.attempts.length,
      failure: agent.failure,
      traces: agent.traces.length,
    };
  }

  const files = result.finished ? writeArtifacts(result.layout, options.outDir) : [];
  return { ...result, files };
}

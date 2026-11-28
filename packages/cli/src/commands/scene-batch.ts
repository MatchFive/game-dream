import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createProvider, type ProviderKind } from '@gamedream/agent';
import {
  loadKit,
  readTraces,
  runSceneAgent,
  summarize,
  type DatasetStats,
  type Kit,
} from '@gamedream/scene';

/**
 * 批量跑场景需求。
 *
 * 这是"跑量"这一步的项目入口：读一串需求 → 逐条走 agent（失败回喂重试）→
 * 每次尝试落一条 trace → 结束出统计。为什么要有它：单个 prompt 试一次看不出
 * 模型的失败分布，而 SFT/偏好对需要样本量。
 */

export interface SceneBatchOptions {
  promptsPath: string;
  outDir: string;
  kitPath: string;
  /** 只跑前 N 条，用来先估成本 */
  limit?: number;
  provider?: ProviderKind;
  /** 从 Studio 设置里取模型凭据（key 不回显，只在本进程用） */
  workspace?: string;
  /** 默认清空 trace，避免上一轮样本混进统计 */
  append?: boolean;
  attempts?: number;
  env?: NodeJS.ProcessEnv;
  onResult?: (result: SceneBatchResult, index: number, total: number) => void;
}

export interface SceneBatchResult {
  prompt: string;
  finished: boolean;
  attempts: number;
  buildings: number;
  density: number;
  issues: string[];
  ms: number;
}

export interface SceneBatchOutcome {
  stats: DatasetStats;
  results: SceneBatchResult[];
  traceFile: string;
  provider: string;
  skipped: number;
}

export function readPromptFile(path: string): string[] {
  if (!existsSync(path)) throw new Error(`prompt file not found: ${path}`);
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

export async function sceneBatchCommand(options: SceneBatchOptions): Promise<SceneBatchOutcome> {
  const kitPath = resolve(options.kitPath);
  if (!existsSync(kitPath)) throw new Error(`kit not found: ${kitPath}`);
  const kit: Kit = loadKit(kitPath);

  let prompts = readPromptFile(options.promptsPath);
  if (options.limit !== undefined) prompts = prompts.slice(0, Math.max(0, options.limit));
  if (prompts.length === 0) throw new Error('prompt file has no prompts');

  const outDir = resolve(options.outDir);
  mkdirSync(outDir, { recursive: true });
  const traceFile = join(outDir, 'traces.jsonl');
  if (!options.append) writeFileSync(traceFile, '', 'utf8');

  const env = await withStudioEnv(options.workspace, options.env ?? process.env);
  const provider = createProvider({ kind: options.provider ?? 'auto', env });

  const results: SceneBatchResult[] = [];
  let skipped = 0;

  for (const [index, prompt] of prompts.entries()) {
    const started = Date.now();
    try {
      const outcome = await runSceneAgent({
        prompt,
        kit,
        provider,
        traceFile,
        maxAttempts: options.attempts ?? 3,
      });
      const last = outcome.traces[outcome.traces.length - 1];
      const result: SceneBatchResult = {
        prompt,
        finished: outcome.finished,
        attempts: outcome.attempts.length,
        buildings: outcome.layout.buildings.length,
        density: last?.validation?.metrics?.density ?? 0,
        issues: (last?.validation?.issues ?? []).map((issue) => issue.code),
        ms: Date.now() - started,
      };
      results.push(result);
      options.onResult?.(result, index, prompts.length);
    } catch (error) {
      // 单条失败不打断整批：一条脏需求不该让后面几十条跑不了
      skipped += 1;
      const result: SceneBatchResult = {
        prompt,
        finished: false,
        attempts: 0,
        buildings: 0,
        density: 0,
        issues: [`error: ${(error as Error).message.slice(0, 120)}`],
        ms: Date.now() - started,
      };
      results.push(result);
      options.onResult?.(result, index, prompts.length);
    }
  }

  const { traces } = readTraces(traceFile);
  const stats = summarize(traces);
  writeFileSync(
    join(outDir, 'stats.json'),
    `${JSON.stringify({ provider: provider.name, prompts: options.promptsPath, stats, skipped }, null, 2)}\n`,
    'utf8',
  );

  return { stats, results, traceFile, provider: provider.name, skipped };
}

/** 有 workspace 时把 Studio 设置里的模型配置合进 env（设置优先）。 */
async function withStudioEnv(
  workspace: string | undefined,
  base: NodeJS.ProcessEnv,
): Promise<NodeJS.ProcessEnv> {
  if (!workspace) return base;
  const { loadStudioSettings, studioEnv } = await import('@gamedream/studio');
  const settings = loadStudioSettings(resolve(workspace), base);
  const fromSettings = studioEnv(settings);
  return { ...base, ...fromSettings };
}

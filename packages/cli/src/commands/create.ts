import {
  createProject,
  createProvider,
  type CreateMode,
  type CreateResult,
  type ProviderKind,
} from '@gamedream/agent';
import type { CommandRunner } from '@gamedream/godot';
import { exitCodeFor, verifyCommand, type VerifyReport } from './verify.js';

export interface CreateCommandOptions {
  prompt: string;
  outDir: string;
  modulesDir: string;
  templatesDir: string;
  providerKind?: ProviderKind;
  mode?: CreateMode;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  runner?: CommandRunner;
  verify?: boolean;
  visual?: boolean;
}

export interface CreateCommandResult {
  result: CreateResult;
  verify?: VerifyReport;
  notice?: string;
}

export function parseCreateMode(value: string): CreateMode {
  if (value === 'auto' || value === 'dry-run') return value;
  throw new Error('--mode must be auto or dry-run');
}

export function parseProviderKind(value: string): ProviderKind {
  if (value === 'auto' || value === 'fake' || value === 'openai') return value;
  throw new Error('--provider must be auto, fake, or openai');
}

export function createExitCode(verify?: VerifyReport): 0 | 2 | 3 {
  return verify ? exitCodeFor(verify) : 0;
}

export async function createCommand(
  options: CreateCommandOptions,
): Promise<CreateCommandResult> {
  const mode = options.mode ?? 'auto';
  const providerKind = options.providerKind ?? 'auto';
  const env = options.env ?? process.env;
  const provider = createProvider({
    kind: providerKind,
    env,
    fetchImpl: options.fetchImpl,
  });
  const notice =
    providerKind === 'fake'
      ? 'Using the deterministic fake provider; the prompt is not interpreted by a model.'
      : providerKind === 'auto' && !env.OPENAI_API_KEY
        ? 'OPENAI_API_KEY not set; using the deterministic fake provider — the prompt is not interpreted by a model.'
        : undefined;

  const result = await createProject({
    prompt: options.prompt,
    outDir: options.outDir,
    modulesDir: options.modulesDir,
    templatesDir: options.templatesDir,
    provider,
    mode,
  });

  if (mode === 'dry-run' || options.verify === false) {
    return { result, notice };
  }

  const report = await verifyCommand({
    projectDir: result.outDir,
    env,
    runner: options.runner,
    visual: options.visual,
  });
  return { result, verify: report, notice };
}

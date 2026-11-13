import {
  createProject,
  createProvider,
  type CreateMode,
  type CreateResult,
  type ProviderKind,
} from '@gamedream/agent';
import type { CommandRunner } from '@gamedream/godot';
import { verifyCommand, type VerifyReport } from './verify.js';

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
}

export interface CreateCommandResult {
  result: CreateResult;
  verify?: VerifyReport;
}

export async function createCommand(
  options: CreateCommandOptions,
): Promise<CreateCommandResult> {
  const mode = options.mode ?? 'auto';
  const provider = createProvider({
    kind: options.providerKind ?? 'auto',
    env: options.env,
    fetchImpl: options.fetchImpl,
  });
  const result = await createProject({
    prompt: options.prompt,
    outDir: options.outDir,
    modulesDir: options.modulesDir,
    templatesDir: options.templatesDir,
    provider,
    mode,
  });

  if (mode === 'dry-run' || options.verify === false) return { result };

  const report = await verifyCommand({
    projectDir: result.outDir,
    env: options.env,
    runner: options.runner,
  });
  return { result, verify: report };
}

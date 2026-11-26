import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CommandRunner } from './runner.js';
import { runCommand } from './runner.js';
import type { CommandResult, GodotInstallation } from './types.js';

export interface GodotExportOptions {
  projectDir: string;
  godot: GodotInstallation;
  preset: string;
  outPath: string;
  debug?: boolean;
  timeoutMs?: number;
  runner?: CommandRunner;
}

export type GodotExportFailure = 'templates' | 'rcedit' | 'other';

export interface GodotExportResult extends CommandResult {
  outputExists: boolean;
  succeeded: boolean;
  failureReason?: GodotExportFailure;
}

function outputState(path: string): { exists: boolean; size: number; mtimeMs: number; file: boolean } {
  try {
    const stat = statSync(path);
    return { exists: true, size: stat.size, mtimeMs: stat.mtimeMs, file: stat.isFile() };
  } catch {
    return { exists: false, size: 0, mtimeMs: 0, file: false };
  }
}

export async function exportProject(options: GodotExportOptions): Promise<GodotExportResult> {
  const presets = `${options.projectDir}/export_presets.cfg`;
  if (!existsSync(presets)) {
    throw new Error('export_presets.cfg not found; compose the project first');
  }
  if (!readFileSync(presets, 'utf8').includes(`name="${options.preset}"`)) {
    throw new Error(`export preset not found: ${options.preset}`);
  }
  mkdirSync(dirname(options.outPath), { recursive: true });
  const before = outputState(options.outPath);
  const runner = options.runner ?? runCommand;
  const result = await runner.run(
    options.godot.bin,
    [
      '--headless',
      '--path',
      options.projectDir,
      options.debug ? '--export-debug' : '--export-release',
      options.preset,
      options.outPath,
    ],
    { timeoutMs: options.timeoutMs ?? 300_000 },
  );
  const after = outputState(options.outPath);
  const refreshed = !before.exists
    || after.mtimeMs !== before.mtimeMs
    || after.size !== before.size;
  const succeeded = result.exitCode === 0 && after.exists && after.file && refreshed;
  let failureReason: GodotExportFailure | undefined;
  if (!succeeded && result.exitCode !== 0) {
    const text = `${result.stdout}\n${result.stderr}`;
    if (/导出模板|不存在.*模板|export templates? (?:not found|missing)|No export template|template.*not found/i.test(text)) {
      failureReason = 'templates';
    } else if (/rcedit/i.test(text)) {
      failureReason = 'rcedit';
    } else {
      failureReason = 'other';
    }
  } else if (!succeeded) {
    failureReason = 'other';
  }
  if (!succeeded && !before.exists && after.exists) {
    rmSync(options.outPath, { recursive: true, force: true });
  }
  return {
    ...result,
    outputExists: after.exists,
    succeeded,
    ...(failureReason ? { failureReason } : {}),
  };
}

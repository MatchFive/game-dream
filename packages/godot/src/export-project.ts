import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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

export interface GodotExportResult extends CommandResult {
  outputExists: boolean;
  missingTemplates: boolean;
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
  const text = `${result.stdout}\n${result.stderr}`;
  return {
    ...result,
    outputExists: existsSync(options.outPath),
    missingTemplates:
      /导出模板|不存在.*模板|export templates? (?:not found|missing)|No export template|template.*not found|rcedit/i.test(
        text,
      ),
  };
}

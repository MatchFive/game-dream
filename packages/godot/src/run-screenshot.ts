import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { hasMarker } from './logs.js';
import type { CommandRunner } from './runner.js';
import { runCommand } from './runner.js';
import type { CommandResult, GodotInstallation } from './types.js';

export interface ScreenshotMetrics {
  width: number;
  height: number;
  samples: number;
  non_black: number;
  colors: number;
  center_colors: number;
}

export interface ScreenshotResult extends CommandResult {
  imagePath?: string;
  metrics?: ScreenshotMetrics;
}

export async function runScreenshot(
  projectDir: string,
  godot: GodotInstallation,
  options: {
    outPath?: string;
    timeoutMs?: number;
    runner?: CommandRunner;
  } = {},
): Promise<ScreenshotResult> {
  const runner = options.runner ?? runCommand;
  let result: CommandResult;
  try {
    result = await runner.run(
      godot.bin,
      [
        '--fixed-fps',
        '60',
        '--path',
        projectDir,
        '--quit-after',
        '600',
        '--',
        '--screenshot',
      ],
      { timeoutMs: options.timeoutMs ?? 60_000 },
    );
  } catch (error) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
    };
  }

  const pathMatch = /GAMEDREAM_SCREENSHOT_PATH=([^\r\n]+)/.exec(result.stdout);
  const metricsMatch = /GAMEDREAM_SCREENSHOT_METRICS=([^\r\n]+)/.exec(result.stdout);
  const source = pathMatch?.[1]?.trim();
  let imagePath: string | undefined;
  if (hasMarker(result, 'GAMEDREAM_SCREENSHOT_OK') && source && existsSync(source)) {
    imagePath = source;
    if (options.outPath) {
      try {
        mkdirSync(dirname(options.outPath), { recursive: true });
        copyFileSync(source, options.outPath);
        imagePath = options.outPath;
      } catch {
        imagePath = undefined;
      }
    }
  }

  let metrics: ScreenshotMetrics | undefined;
  if (metricsMatch) {
    try {
      metrics = JSON.parse(metricsMatch[1]) as ScreenshotMetrics;
    } catch {
      metrics = undefined;
    }
  }

  return { ...result, imagePath, metrics };
}

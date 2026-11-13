import { join } from 'node:path';
import {
  detectGodot,
  runScreenshot,
  type CommandRunner,
  type GodotInstallation,
  type ScreenshotResult,
} from '@gamedream/godot';

export interface ScreenshotCommandOptions {
  projectDir: string;
  outPath?: string;
  env?: NodeJS.ProcessEnv;
  runner?: CommandRunner;
}

export interface ScreenshotCommandResult {
  godot: GodotInstallation | null;
  result: ScreenshotResult | null;
  outPath: string;
}

export async function screenshotCommand(
  options: ScreenshotCommandOptions,
): Promise<ScreenshotCommandResult> {
  const outPath =
    options.outPath ?? join(options.projectDir, 'game/_generated/screenshot.png');
  const godot = await detectGodot({ env: options.env, runner: options.runner });
  if (!godot) return { godot: null, result: null, outPath };
  const result = await runScreenshot(options.projectDir, godot, {
    outPath,
    runner: options.runner,
  });
  return { godot, result, outPath };
}

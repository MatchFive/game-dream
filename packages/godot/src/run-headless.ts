import type { CommandRunner } from './runner.js';
import { runCommand } from './runner.js';
import type { CommandResult, GodotInstallation } from './types.js';

export async function runHeadless(
  projectDir: string,
  godot: GodotInstallation,
  options: { quitAfter?: number; timeoutMs?: number; runner?: CommandRunner } = {},
): Promise<CommandResult> {
  const runner = options.runner ?? runCommand;
  const args = ['--headless', '--fixed-fps', '60', '--path', projectDir];
  if (options.quitAfter !== undefined) args.push('--quit-after', String(options.quitAfter));
  return runner.run(godot.bin, args, { timeoutMs: options.timeoutMs ?? 120_000 });
}

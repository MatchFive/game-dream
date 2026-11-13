import type { CommandRunner } from './runner.js';
import { runCommand } from './runner.js';
import type { CommandResult, GodotInstallation } from './types.js';

export async function importProject(
  projectDir: string,
  godot: GodotInstallation,
  runner: CommandRunner = runCommand,
): Promise<CommandResult> {
  return runner.run(godot.bin, ['--headless', '--path', projectDir, '--import'], {
    timeoutMs: 120_000,
  });
}

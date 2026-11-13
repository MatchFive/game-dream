import type { CommandRunner } from './runner.js';
import { runCommand } from './runner.js';
import type { GodotInstallation } from './types.js';

export async function detectGodot(
  options: {
    env?: NodeJS.ProcessEnv;
    runner?: CommandRunner;
  } = {},
): Promise<GodotInstallation | null> {
  const env = options.env ?? process.env;
  const runner = options.runner ?? runCommand;
  const candidates = [env.GODOT_BIN, 'godot', 'godot4'].filter(Boolean) as string[];

  for (const bin of candidates) {
    try {
      const result = await runner.run(bin, ['--version']);
      if (result.exitCode !== 0) continue;
      const version = result.stdout.trim().split(/\r?\n/)[0] ?? '';
      const match = version.match(/^(\d+)\.(\d+)/);
      if (!match) continue;
      return { bin, version, major: Number(match[1]), minor: Number(match[2]) };
    } catch {
      // try the next candidate
    }
  }
  return null;
}

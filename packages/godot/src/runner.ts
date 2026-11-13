import { execa } from 'execa';
import type { CommandResult } from './types.js';

export interface CommandRunner {
  run(
    command: string,
    args: string[],
    options?: { cwd?: string; timeoutMs?: number },
  ): Promise<CommandResult>;
}

export const runCommand: CommandRunner = {
  async run(command, args, options) {
    const result = await execa(command, args, {
      cwd: options?.cwd,
      timeout: options?.timeoutMs ?? 30_000,
      reject: false,
      windowsHide: true,
    });
    return {
      exitCode: result.exitCode ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  },
};

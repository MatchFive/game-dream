import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export interface WebVerifyResult {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  message?: string;
}

export function verifyWebProject(options: {
  projectDir: string;
  frames?: number;
}): WebVerifyResult {
  const required = ['index.html', 'style.css', 'sim.mjs', 'sim-run.mjs', 'game.js', 'game.json'];
  for (const file of required) {
    if (!existsSync(join(options.projectDir, file))) {
      return {
        passed: false,
        exitCode: 1,
        stdout: '',
        stderr: '',
        message: `missing ${file}`,
      };
    }
  }
  const result = spawnSync(
    process.execPath,
    [join(options.projectDir, 'sim-run.mjs'), '--frames', String(options.frames ?? 600)],
    { cwd: options.projectDir, encoding: 'utf8', timeout: 30_000 },
  );
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const exitCode = result.status ?? 1;
  const missing = ['WEB_BOOT_OK', 'WEB_WIN'].find((marker) => !stdout.includes(marker));
  if (exitCode !== 0) {
    return { passed: false, exitCode, stdout, stderr, message: stderr || `exit ${exitCode}` };
  }
  if (missing) {
    return { passed: false, exitCode, stdout, stderr, message: `missing ${missing}` };
  }
  return { passed: true, exitCode: 0, stdout, stderr };
}

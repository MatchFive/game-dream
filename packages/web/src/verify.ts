import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { WEB_PROJECT_FILES } from './compose.js';

export interface WebVerifyResult {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  message?: string;
}

function hasMarker(stdout: string, marker: string): boolean {
  return stdout.split(/\r?\n/).some((line) => line.trim() === marker);
}

export function verifyWebProject(options: {
  projectDir: string;
  frames?: number;
}): WebVerifyResult {
  const projectDir = resolve(options.projectDir);
  for (const file of WEB_PROJECT_FILES) {
    if (!existsSync(join(projectDir, file))) {
      return {
        passed: false,
        exitCode: 1,
        stdout: '',
        stderr: '',
        message: `missing ${file}`,
      };
    }
  }
  let config: { levels?: unknown[]; quests?: Array<{ type?: string }> };
  try {
    config = JSON.parse(readFileSync(join(projectDir, 'game.json'), 'utf8'));
  } catch (error) {
    return {
      passed: false,
      exitCode: 1,
      stdout: '',
      stderr: '',
      message: `invalid game.json: ${(error as Error).message}`,
    };
  }
  const requiredMarkers = ['WEB_BOOT_OK'];
  if (Array.isArray(config.levels) && config.levels.length > 0) {
    requiredMarkers.push('WEB_MAP_OK');
  }
  if (
    Array.isArray(config.quests) &&
    config.quests.some((quest) => (quest.type ?? 'kill') === 'kill')
  ) {
    requiredMarkers.push('WEB_QUEST_COMPLETE');
  }
  requiredMarkers.push('WEB_WIN');

  const result = spawnSync(
    process.execPath,
    [
      join(projectDir, 'sim-run.mjs'),
      '--frames',
      String(options.frames ?? 600),
    ],
    { cwd: projectDir, encoding: 'utf8', timeout: 30_000 },
  );
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const errorCode = (result.error as NodeJS.ErrnoException | undefined)?.code;
  const exitCode = result.status ?? (errorCode === 'ETIMEDOUT' ? 124 : 1);
  if (result.error) {
    return {
      passed: false,
      exitCode,
      stdout,
      stderr,
      message:
        errorCode === 'ETIMEDOUT'
          ? 'sim timed out after 30s'
          : `sim failed: ${result.error.message}`,
    };
  }
  const missing = requiredMarkers.find((marker) => !hasMarker(stdout, marker));
  if (exitCode !== 0 || missing) {
    const marker = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('WEB_'))
      .pop();
    return {
      passed: false,
      exitCode,
      stdout,
      stderr,
      message: marker
        ? `${marker}${missing ? ` (missing ${missing})` : ''}`
        : stderr || `exit ${exitCode}`,
    };
  }
  return { passed: true, exitCode: 0, stdout, stderr };
}

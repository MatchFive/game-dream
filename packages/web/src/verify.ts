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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidGame(message: string): WebVerifyResult {
  return {
    passed: false,
    exitCode: 1,
    stdout: '',
    stderr: '',
    message: `invalid game.json: ${message}`,
  };
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(projectDir, 'game.json'), 'utf8'));
  } catch (error) {
    return invalidGame((error as Error).message);
  }
  if (!isRecord(parsed)) return invalidGame('top level must be an object');

  const rawLevels = parsed.levels;
  if (rawLevels !== undefined) {
    if (!Array.isArray(rawLevels)) return invalidGame('levels must be an array');
    for (const [index, level] of rawLevels.entries()) {
      if (!isRecord(level)) return invalidGame(`levels[${index}] must be an object`);
      if (level.enemy !== undefined) {
        if (!isRecord(level.enemy)) {
          return invalidGame(`levels[${index}].enemy must be an object`);
        }
        if (level.enemy.kind !== undefined && typeof level.enemy.kind !== 'string') {
          return invalidGame(`levels[${index}].enemy.kind must be a string`);
        }
      }
    }
  }

  const rawQuests = parsed.quests;
  if (rawQuests !== undefined) {
    if (!Array.isArray(rawQuests)) return invalidGame('quests must be an array');
    for (const [index, quest] of rawQuests.entries()) {
      if (!isRecord(quest)) return invalidGame(`quests[${index}] must be an object`);
      if (quest.type !== undefined && typeof quest.type !== 'string') {
        return invalidGame(`quests[${index}].type must be a string`);
      }
    }
  }

  const levels = (rawLevels ?? []) as Array<Record<string, unknown>>;
  const quests = (rawQuests ?? []) as Array<Record<string, unknown>>;
  const requiredMarkers = ['WEB_BOOT_OK'];
  if (levels.length > 0) {
    requiredMarkers.push('WEB_MAP_OK');
    if (levels.some((level) => isRecord(level.enemy) && level.enemy.kind === 'boss')) {
      requiredMarkers.push('WEB_BOSS_PHASE');
    }
  }
  if (quests.some((quest) => (quest.type ?? 'kill') === 'kill')) {
    requiredMarkers.push('WEB_QUEST_COMPLETE');
  }
  requiredMarkers.push('WEB_WIN');

  const result = spawnSync(
    process.execPath,
    [
      join(projectDir, 'sim-run.mjs'),
      '--frames',
      String(options.frames ?? 1800),
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

import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface UnityRuntimeOptions {
  projectDir: string;
  unityBin: string;
  timeoutMs?: number;
}

export interface UnityRuntimeResult {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  message?: string;
}

export function hasUnityMarker(stdout: string, marker: string): boolean {
  return stdout.split(/\r?\n/).some((line) => line.trim() === marker);
}

export function runUnityVerifier(options: UnityRuntimeOptions): UnityRuntimeResult {
  const projectDir = resolve(options.projectDir);
  const unityBin = resolve(options.unityBin);
  const result = spawnSync(
    unityBin,
    [
      '-batchmode',
      '-quit',
      '-accept-apiupdate',
      '-silent-crashes',
      '-projectPath',
      projectDir,
      '-executeMethod',
      'EditorVerifier.Run',
      '-logFile',
      '-',
    ],
    {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: options.timeoutMs ?? 180_000,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const errorCode = (result.error as NodeJS.ErrnoException | undefined)?.code;
  const exitCode = result.status ?? (errorCode === 'ETIMEDOUT' ? 124 : 1);
  if (errorCode === 'ETIMEDOUT') {
    rmSync(join(projectDir, 'Temp/UnityLockfile'), { force: true });
  }
  if (result.error) {
    return {
      passed: false,
      exitCode,
      stdout,
      stderr,
      message:
        errorCode === 'ETIMEDOUT'
          ? 'Unity runtime timed out; check for leftover Unity processes and remove Temp/UnityLockfile'
          : errorCode === 'ENOBUFS'
            ? 'Unity log exceeded the output buffer'
            : `Unity failed to start: ${result.error.message}`,
    };
  }
  if (exitCode !== 0) {
    return {
      passed: false,
      exitCode,
      stdout,
      stderr,
      message: result.signal ? `Unity killed by ${result.signal}` : `Unity exited ${exitCode}`,
    };
  }
  const log = `${stdout}\n${stderr}`;
  for (const marker of ['UNITY_SIM_OK', 'UNITY_WIN']) {
    if (!hasUnityMarker(log, marker)) {
      return { passed: false, exitCode: 1, stdout, stderr, message: `missing ${marker}` };
    }
  }
  return { passed: true, exitCode: 0, stdout, stderr };
}

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

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

function hasMarker(stdout: string, marker: string): boolean {
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
      '-projectPath',
      projectDir,
      '-executeMethod',
      'EditorVerifier.Run',
      '-logFile',
      '-',
    ],
    { cwd: projectDir, encoding: 'utf8', timeout: options.timeoutMs ?? 180_000 },
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
          ? 'Unity runtime timed out'
          : `Unity failed to start: ${result.error.message}`,
    };
  }
  if (exitCode !== 0) {
    return { passed: false, exitCode, stdout, stderr, message: `Unity exited ${exitCode}` };
  }
  for (const marker of ['UNITY_SIM_OK', 'UNITY_WIN']) {
    if (!hasMarker(stdout, marker)) {
      return { passed: false, exitCode: 1, stdout, stderr, message: `missing ${marker}` };
    }
  }
  return { passed: true, exitCode: 0, stdout, stderr };
}

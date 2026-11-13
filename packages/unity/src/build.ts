import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface UnityBuildOptions {
  projectDir: string;
  unityBin: string;
  outPath?: string;
  timeoutMs?: number;
}

export interface UnityBuildResult {
  passed: boolean;
  exitCode: number;
  outputPath: string;
  stdout: string;
  stderr: string;
  message?: string;
}

export interface UnityScreenshotOptions {
  projectDir: string;
  unityBin: string;
  outPath?: string;
  timeoutMs?: number;
}

export interface UnityScreenshotResult {
  passed: boolean;
  exitCode: number;
  imagePath: string;
  stdout: string;
  stderr: string;
  message?: string;
}

function hasMarker(stdout: string, marker: string): boolean {
  return stdout.split(/\r?\n/).some((line) => line.trim().startsWith(marker));
}

function outputFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile() && statSync(path).size > 0;
}

export function runUnityBuild(options: UnityBuildOptions): UnityBuildResult {
  const projectDir = resolve(options.projectDir);
  const outputPath = resolve(
    options.outPath ?? `${projectDir}/Builds/Windows/GameDream.exe`,
  );
  mkdirSync(dirname(outputPath), { recursive: true });
  rmSync(outputPath, { force: true });
  const result = spawnSync(
    resolve(options.unityBin),
    [
      '-batchmode',
      '-quit',
      '-accept-apiupdate',
      '-silent-crashes',
      '-projectPath',
      projectDir,
      '-executeMethod',
      'ProjectBuilder.BuildWindows',
      '-logFile',
      '-',
    ],
    {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: options.timeoutMs ?? 300_000,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GAMEDREAM_BUILD_OUT: outputPath },
    },
  );
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const errorCode = (result.error as NodeJS.ErrnoException | undefined)?.code;
  const exitCode = result.status ?? (errorCode === 'ETIMEDOUT' ? 124 : 1);
  if (result.error) {
    return {
      passed: false,
      exitCode,
      outputPath,
      stdout,
      stderr,
      message:
        errorCode === 'ETIMEDOUT'
          ? 'Unity build timed out'
          : `Unity failed to start: ${result.error.message}`,
    };
  }
  if (exitCode !== 0) {
    return { passed: false, exitCode, outputPath, stdout, stderr, message: `Unity exited ${exitCode}` };
  }
  if (!hasMarker(stdout, 'UNITY_BUILD_OK')) {
    return { passed: false, exitCode: 1, outputPath, stdout, stderr, message: 'missing UNITY_BUILD_OK' };
  }
  if (!outputFile(outputPath)) {
    return {
      passed: false,
      exitCode: 1,
      outputPath,
      stdout,
      stderr,
      message: 'Unity reported success but produced no player',
    };
  }
  return { passed: true, exitCode: 0, outputPath, stdout, stderr };
}

export function runUnityScreenshot(options: UnityScreenshotOptions): UnityScreenshotResult {
  const projectDir = resolve(options.projectDir);
  const imagePath = resolve(options.outPath ?? `${projectDir}/Screenshots/unity.png`);
  mkdirSync(dirname(imagePath), { recursive: true });
  rmSync(imagePath, { force: true });
  const result = spawnSync(
    resolve(options.unityBin),
    [
      '-batchmode',
      '-accept-apiupdate',
      '-silent-crashes',
      '-projectPath',
      projectDir,
      '-executeMethod',
      'ScreenshotCapture.Run',
      '-logFile',
      '-',
    ],
    {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: options.timeoutMs ?? 180_000,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GAMEDREAM_SCREENSHOT_OUT: imagePath },
    },
  );
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const errorCode = (result.error as NodeJS.ErrnoException | undefined)?.code;
  const exitCode = result.status ?? (errorCode === 'ETIMEDOUT' ? 124 : 1);
  if (result.error) {
    return {
      passed: false,
      exitCode,
      imagePath,
      stdout,
      stderr,
      message:
        errorCode === 'ETIMEDOUT'
          ? 'Unity screenshot timed out'
          : `Unity failed to start: ${result.error.message}`,
    };
  }
  if (exitCode !== 0) {
    return { passed: false, exitCode, imagePath, stdout, stderr, message: `Unity exited ${exitCode}` };
  }
  if (!hasMarker(stdout, 'UNITY_SCREENSHOT_OK')) {
    return {
      passed: false,
      exitCode: 1,
      imagePath,
      stdout,
      stderr,
      message: 'missing UNITY_SCREENSHOT_OK',
    };
  }
  if (!outputFile(imagePath)) {
    return {
      passed: false,
      exitCode: 1,
      imagePath,
      stdout,
      stderr,
      message: 'Unity reported a screenshot but produced no PNG',
    };
  }
  return { passed: true, exitCode: 0, imagePath, stdout, stderr };
}

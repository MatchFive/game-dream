import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

export type UnityBuildTarget = 'windows' | 'webgl';

export interface UnityBuildOptions {
  projectDir: string;
  unityBin: string;
  target?: UnityBuildTarget;
  outPath?: string;
  timeoutMs?: number;
}

export interface UnityBuildResult {
  passed: boolean;
  exitCode: number;
  target: UnityBuildTarget;
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
  return stdout.split(/\r?\n/).some((line) => line.trim().split(/\s+/)[0] === marker);
}

function outputFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile() && statSync(path).size > 0;
}

function dataDir(path: string): string {
  return path.replace(/\.exe$/i, '_Data');
}

function screenshotMetrics(stdout: string): { width: number; height: number; colors: number } | null {
  const match = /UNITY_SCREENSHOT_OK\s+.+?\s+(\d+)x(\d+)\s+colors=(\d+)/.exec(stdout);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]), colors: Number(match[3]) };
}

export function runUnityBuild(options: UnityBuildOptions): UnityBuildResult {
  const projectDir = resolve(options.projectDir);
  const target = options.target ?? 'windows';
  const outputPath = resolve(
    options.outPath ??
      (target === 'webgl'
        ? `${projectDir}/Builds/WebGL`
        : `${projectDir}/Builds/Windows/GameDream.exe`),
  );
  if (
    target === 'webgl' &&
    (outputPath === projectDir ||
      projectDir.startsWith(outputPath + sep) ||
      /^[A-Za-z]:[\\/]?$/.test(outputPath) ||
      outputPath === resolve(process.cwd()))
  ) {
    throw new Error('refusing to delete the project, workspace, or filesystem root as WebGL output');
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  const stampPath = `${outputPath}.gamedream-build.json`;
  rmSync(stampPath, { force: true });
  if (target === 'webgl') {
    rmSync(outputPath, { recursive: true, force: true });
    mkdirSync(outputPath, { recursive: true });
  } else {
    rmSync(outputPath, { force: true });
  }
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
      target === 'webgl' ? 'ProjectBuilder.BuildWebGL' : 'ProjectBuilder.BuildWindows',
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
  if (errorCode === 'ETIMEDOUT') {
    rmSync(`${projectDir}/Temp/UnityLockfile`, { force: true });
  }
  if (result.error) {
    return {
      passed: false,
      exitCode,
      target,
      outputPath,
      stdout,
      stderr,
      message:
        errorCode === 'ETIMEDOUT'
          ? 'Unity build timed out; check for leftover Unity processes'
          : errorCode === 'ENOBUFS'
            ? 'Unity log exceeded the output buffer'
            : `Unity failed to start: ${result.error.message}`,
    };
  }
  if (exitCode !== 0) {
    const missingTarget = stdout.includes('UNITY_BUILD_MISSING_TARGET') ||
      stdout.includes('UNITY_WEBGL_BUILD_MISSING_TARGET');
    return {
      passed: false,
      exitCode,
      target,
      outputPath,
      stdout,
      stderr,
      message: missingTarget
        ? `${target === 'webgl' ? 'WebGL' : 'Windows'} Build Support is not installed for this Unity editor`
        : result.signal
          ? `Unity killed by ${result.signal}`
          : `Unity exited ${exitCode}`,
    };
  }
  const marker = target === 'webgl' ? 'UNITY_WEBGL_BUILD_OK' : 'UNITY_BUILD_OK';
  if (!hasMarker(stdout, marker)) {
    return { passed: false, exitCode: 1, target, outputPath, stdout, stderr, message: `missing ${marker}` };
  }
  const valid = target === 'webgl'
    ? outputFile(join(outputPath, 'index.html')) && existsSync(join(outputPath, 'Build'))
    : outputFile(outputPath) && existsSync(dataDir(outputPath));
  if (!valid) {
    return {
      passed: false,
      exitCode: 1,
      target,
      outputPath,
      stdout,
      stderr,
      message:
        target === 'webgl'
          ? 'Unity reported success but produced no WebGL index.html/Build directory'
          : 'Unity reported success but produced no player/_Data directory',
    };
  }
  writeFileSync(
    stampPath,
    `${JSON.stringify({ target, outputPath, builtAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
  return { passed: true, exitCode: 0, target, outputPath, stdout, stderr };
}

export interface UnitySmokeOptions {
  projectDir: string;
  exePath?: string;
  timeoutMs?: number;
}

export interface UnitySmokeResult {
  passed: boolean;
  exitCode: number;
  exePath: string;
  logPath: string;
  stdout: string;
  stderr: string;
  message?: string;
}

export function runUnitySmoke(options: UnitySmokeOptions): UnitySmokeResult {
  const projectDir = resolve(options.projectDir);
  const exePath = resolve(
    options.exePath ?? `${projectDir}/Builds/Windows/GameDream.exe`,
  );
  const logPath = join(projectDir, 'Temp/smoke.log');
  mkdirSync(dirname(logPath), { recursive: true });
  rmSync(logPath, { force: true });
  if (!outputFile(exePath)) {
    return {
      passed: false,
      exitCode: 1,
      exePath,
      logPath,
      stdout: '',
      stderr: '',
      message: 'player executable not found; run unity build first',
    };
  }
  if (!existsSync(`${exePath}.gamedream-build.json`)) {
    return {
      passed: false,
      exitCode: 1,
      exePath,
      logPath,
      stdout: '',
      stderr: '',
      message: 'player has no build stamp; run unity build first',
    };
  }
  const result = spawnSync(exePath, ['-batchmode', '-nographics', '-logFile', logPath], {
    cwd: projectDir,
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 30_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GAMEDREAM_SMOKE_OUT: '1' },
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const errorCode = (result.error as NodeJS.ErrnoException | undefined)?.code;
  const exitCode = result.status ?? (errorCode === 'ETIMEDOUT' ? 124 : 1);
  const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  if (result.error) {
    return {
      passed: false,
      exitCode,
      exePath,
      logPath,
      stdout,
      stderr,
      message:
        errorCode === 'ETIMEDOUT'
          ? 'player smoke timed out'
          : `player failed to start: ${result.error.message}`,
    };
  }
  if (exitCode !== 0) {
    return { passed: false, exitCode, exePath, logPath, stdout, stderr, message: `player exited ${exitCode}` };
  }
  if (!hasMarker(log, 'UNITY_BOOT_OK') || !hasMarker(log, 'UNITY_SMOKE_OK')) {
    return {
      passed: false,
      exitCode: 1,
      exePath,
      logPath,
      stdout,
      stderr,
      message: 'player log is missing UNITY_BOOT_OK or UNITY_SMOKE_OK',
    };
  }
  return { passed: true, exitCode: 0, exePath, logPath, stdout, stderr };
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
  if (errorCode === 'ETIMEDOUT') {
    rmSync(`${projectDir}/Temp/UnityLockfile`, { force: true });
  }
  if (result.error) {
    return {
      passed: false,
      exitCode,
      imagePath,
      stdout,
      stderr,
      message:
        errorCode === 'ETIMEDOUT'
          ? 'Unity screenshot timed out; check for leftover Unity processes'
          : errorCode === 'ENOBUFS'
            ? 'Unity log exceeded the output buffer'
            : `Unity failed to start: ${result.error.message}`,
    };
  }
  if (exitCode !== 0) {
    return {
      passed: false,
      exitCode,
      imagePath,
      stdout,
      stderr,
      message: result.signal ? `Unity killed by ${result.signal}` : `Unity exited ${exitCode}`,
    };
  }
  const metrics = screenshotMetrics(stdout);
  if (!metrics || metrics.width < 64 || metrics.height < 64 || metrics.colors < 2) {
    return {
      passed: false,
      exitCode: 1,
      imagePath,
      stdout,
      stderr,
      message: 'screenshot is missing dimensions/colors or is flat',
    };
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

import {
  composeUnityProject,
  detectUnity,
  runUnityBuild,
  runUnityScreenshot,
  runUnitySmoke,
  runUnityVerifier,
  verifyUnityProject,
  type ComposeUnityOptions,
  type UnityGameConfig,
  type UnityRuntimeResult,
} from '@gamedream/unity';
import { verifyWebVisual } from '@gamedream/web';

export interface UnityComposeOptions extends ComposeUnityOptions {}

export function unityComposeCommand(options: UnityComposeOptions) {
  return composeUnityProject(options);
}

export interface UnityVerifyOptions {
  projectDir: string;
  runtime?: boolean;
  unityBin?: string;
  timeoutMs?: number;
}

export interface UnityVerifyCommandResult {
  passed: boolean;
  exitCode: number;
  message?: string;
  runtime: UnityRuntimeResult | null;
}

export function unityVerifyCommand(options: UnityVerifyOptions): UnityVerifyCommandResult {
  const staticResult = verifyUnityProject({ projectDir: options.projectDir });
  if (!staticResult.passed) {
    return { passed: false, exitCode: 1, message: staticResult.message, runtime: null };
  }
  if (!options.runtime) {
    return { passed: true, exitCode: 0, runtime: null };
  }
  const unity = detectUnity({ bin: options.unityBin });
  if (!unity) {
    return {
      passed: false,
      exitCode: 3,
      message: 'Unity 6000+ not found; set UNITY_BIN or pass --unity',
      runtime: null,
    };
  }
  const runtime = runUnityVerifier({
    projectDir: options.projectDir,
    unityBin: unity.bin,
    timeoutMs: options.timeoutMs,
  });
  return {
    passed: runtime.passed,
    exitCode: runtime.passed ? 0 : 1,
    message: runtime.message,
    runtime,
  };
}

export function unityBuildCommand(options: {
  projectDir: string;
  target?: 'windows' | 'webgl';
  outPath?: string;
  unityBin?: string;
  timeoutMs?: number;
}) {
  const staticResult = verifyUnityProject({ projectDir: options.projectDir });
  if (!staticResult.passed) {
    return { passed: false, exitCode: 1, message: staticResult.message };
  }
  const unity = detectUnity({ bin: options.unityBin });
  if (!unity) {
    return { passed: false, exitCode: 3, message: 'Unity 6000+ not found; set UNITY_BIN or pass --unity' };
  }
  return runUnityBuild({
    projectDir: options.projectDir,
    unityBin: unity.bin,
    target: options.target,
    outPath: options.outPath,
    timeoutMs: options.timeoutMs,
  });
}

export function unitySmokeCommand(options: {
  projectDir: string;
  exePath?: string;
  timeoutMs?: number;
}) {
  return runUnitySmoke({
    projectDir: options.projectDir,
    exePath: options.exePath,
    timeoutMs: options.timeoutMs,
  });
}

export function unityScreenshotCommand(options: {
  projectDir: string;
  outPath?: string;
  unityBin?: string;
  timeoutMs?: number;
}) {
  const staticResult = verifyUnityProject({ projectDir: options.projectDir });
  if (!staticResult.passed) {
    return { passed: false, exitCode: 1, message: staticResult.message };
  }
  const unity = detectUnity({ bin: options.unityBin });
  if (!unity) {
    return { passed: false, exitCode: 3, message: 'Unity 6000+ not found; set UNITY_BIN or pass --unity' };
  }
  return runUnityScreenshot({
    projectDir: options.projectDir,
    unityBin: unity.bin,
    outPath: options.outPath,
    timeoutMs: options.timeoutMs,
  });
}

export async function unityWebGLVerifyCommand(options: {
  projectDir: string;
  outPath?: string;
  width?: number;
  height?: number;
  browserBin?: string;
  settleMs?: number;
  timeoutMs?: number;
}) {
  return verifyWebVisual({
    projectDir: options.projectDir,
    outPath: options.outPath,
    width: options.width ?? 1280,
    height: options.height ?? 720,
    browserBin: options.browserBin,
    settleMs: options.settleMs ?? 12_000,
    timeoutMs: options.timeoutMs ?? 90_000,
    inputs: [{ key: 'ArrowRight', code: 'ArrowRight', holdMs: 800 }],
  });
}

export type { UnityGameConfig };

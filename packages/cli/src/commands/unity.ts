import {
  composeUnityProject,
  detectUnity,
  runUnityVerifier,
  verifyUnityProject,
  type ComposeUnityOptions,
  type UnityGameConfig,
  type UnityRuntimeResult,
} from '@gamedream/unity';

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

export function unityComposeCommand(options: ComposeUnityOptions) {
  return composeUnityProject(options);
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
    exitCode: runtime.passed ? 0 : runtime.exitCode === 3 ? 3 : 1,
    message: runtime.message,
    runtime,
  };
}

export type { UnityGameConfig };

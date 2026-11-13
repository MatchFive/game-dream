import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { UNITY_PROJECT_FILES } from './compose.js';

export interface UnityVerifyResult {
  passed: boolean;
  message?: string;
}

const SCRIPT_META_FILES = [
  'Assets/Scripts/GameConfig.cs.meta',
  'Assets/Scripts/GameSim.cs.meta',
  'Assets/Scripts/GameBootstrap.cs.meta',
  'Assets/Scripts/ScreenshotRunner.cs.meta',
  'Assets/Scripts/SmokeRunner.cs.meta',
  'Assets/Editor/EditorVerifier.cs.meta',
  'Assets/Editor/ProjectBuilder.cs.meta',
  'Assets/Editor/ScreenshotCapture.cs.meta',
] as const;

const REQUIRED_MODULES = [
  'com.unity.modules.imageconversion',
  'com.unity.modules.imgui',
  'com.unity.modules.jsonserialize',
];

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function checkContains(file: string, source: string, tokens: string[]): string | null {
  for (const token of tokens) {
    if (!source.includes(token)) return `${file} is missing ${token}`;
  }
  return null;
}

function verifyInternal(projectDir: string): UnityVerifyResult {
  for (const file of [...UNITY_PROJECT_FILES, ...SCRIPT_META_FILES]) {
    if (!existsSync(join(projectDir, file))) return { passed: false, message: `missing ${file}` };
  }

  const version = read(join(projectDir, 'ProjectSettings/ProjectVersion.txt'));
  if (!/^m_EditorVersion: 6000\.\d+\./m.test(version)) {
    return { passed: false, message: 'ProjectVersion.txt must target Unity 6000.x' };
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(read(join(projectDir, 'Packages/manifest.json')));
  } catch (error) {
    return { passed: false, message: `invalid Packages/manifest.json: ${(error as Error).message}` };
  }
  const dependencies =
    typeof manifest === 'object' && manifest !== null && 'dependencies' in manifest
      ? (manifest as { dependencies?: unknown }).dependencies
      : undefined;
  if (typeof dependencies !== 'object' || dependencies === null) {
    return { passed: false, message: 'Packages/manifest.json has no dependencies' };
  }
  for (const module of REQUIRED_MODULES) {
    if (!(module in dependencies)) {
      return { passed: false, message: `Packages/manifest.json is missing ${module}` };
    }
  }
  const buildSettings = read(join(projectDir, 'ProjectSettings/EditorBuildSettings.asset'));
  if (!buildSettings.includes('path: Assets/Scenes/Main.unity')) {
    return { passed: false, message: 'EditorBuildSettings.asset does not include Main.unity' };
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(read(join(projectDir, 'Assets/Resources/GameConfig.json')));
  } catch (error) {
    return { passed: false, message: `invalid GameConfig.json: ${(error as Error).message}` };
  }
  const arena = config.arena as Record<string, unknown> | undefined;
  if (
    typeof config.name !== 'string' ||
    !arena ||
    typeof arena.width !== 'number' ||
    typeof arena.height !== 'number' ||
    arena.width <= 0 ||
    arena.height <= 0
  ) {
    return { passed: false, message: 'GameConfig.json has no valid name/arena' };
  }

  const simError = checkContains(
    'Assets/Scripts/GameSim.cs',
    read(join(projectDir, 'Assets/Scripts/GameSim.cs')),
    [
      'class GameSim',
      'public void Step(float moveX, float moveY, bool attack, float dt)',
      'void Reset(',
      'bool Won',
      'bool Lost',
      'PlayerAttackRange',
    ],
  );
  if (simError) return { passed: false, message: simError };

  const bootstrapError = checkContains(
    'Assets/Scripts/GameBootstrap.cs',
    read(join(projectDir, 'Assets/Scripts/GameBootstrap.cs')),
    [
      '[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]',
      'UNITY_BOOT_OK',
      'UNITY_WIN',
      'UNITY_LOSE',
      'Input.GetKey',
      'OnGUI',
      'GameSim',
    ],
  );
  if (bootstrapError) return { passed: false, message: bootstrapError };

  const verifierError = checkContains(
    'Assets/Editor/EditorVerifier.cs',
    read(join(projectDir, 'Assets/Editor/EditorVerifier.cs')),
    [
      'class EditorVerifier',
      'UNITY_SIM_OK',
      'GameConfigLoader.Load()',
      'PlayerAttackRange',
      'UNITY_WIN',
      'UNITY_LOSE',
      'UNITY_TIMEOUT',
      'EditorApplication.Exit',
    ],
  );
  if (verifierError) return { passed: false, message: verifierError };

  const builderError = checkContains(
    'Assets/Editor/ProjectBuilder.cs',
    read(join(projectDir, 'Assets/Editor/ProjectBuilder.cs')),
    [
      'class ProjectBuilder',
      'BuildWindows',
      'BuildPipeline.BuildPlayer',
      'StandaloneWindows64',
      'UNITY_BUILD_OK',
      'BuildWebGL',
      'BuildTarget.WebGL',
      'index.html',
      'UNITY_WEBGL_BUILD_OK',
      'UNITY_WEBGL_BUILD_MISSING_TARGET',
      'EnsureScene',
    ],
  );
  if (builderError) return { passed: false, message: builderError };

  const smokeError = checkContains(
    'Assets/Scripts/SmokeRunner.cs',
    read(join(projectDir, 'Assets/Scripts/SmokeRunner.cs')),
    [
      '#if !UNITY_EDITOR',
      'class SmokeRunner',
      'UNITY_SMOKE_OK',
      'GAMEDREAM_SMOKE_OUT',
      'Application.Quit',
    ],
  );
  if (smokeError) return { passed: false, message: smokeError };

  const screenshotError = checkContains(
    'Assets/Editor/ScreenshotCapture.cs',
    read(join(projectDir, 'Assets/Editor/ScreenshotCapture.cs')),
    ['class ScreenshotCapture', 'GAMEDREAM_SCREENSHOT_OUT', 'EnterPlaymode'],
  );
  if (screenshotError) return { passed: false, message: screenshotError };

  const runnerError = checkContains(
    'Assets/Scripts/ScreenshotRunner.cs',
    read(join(projectDir, 'Assets/Scripts/ScreenshotRunner.cs')),
    [
      'class ScreenshotRunner',
      'RenderTexture',
      'EncodeToPNG',
      'UNITY_SCREENSHOT_OK',
      'UNITY_SCREENSHOT_TIMEOUT',
    ],
  );
  if (runnerError) return { passed: false, message: runnerError };

  const guids = new Set<string>();
  for (const file of SCRIPT_META_FILES) {
    const meta = read(join(projectDir, file));
    const match = /^guid: ([0-9a-f]{32})$/m.exec(meta);
    if (!match) return { passed: false, message: `${file} has no valid GUID` };
    if (guids.has(match[1])) return { passed: false, message: `${file} duplicates a GUID` };
    guids.add(match[1]);
  }
  return { passed: true };
}

export function verifyUnityProject(options: { projectDir: string }): UnityVerifyResult {
  try {
    return verifyInternal(resolve(options.projectDir));
  } catch (error) {
    return { passed: false, message: `verification failed: ${(error as Error).message}` };
  }
}

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';

export const UNITY_PROJECT_FILES = [
  'ProjectSettings/ProjectVersion.txt',
  'ProjectSettings/EditorBuildSettings.asset',
  'Packages/manifest.json',
  'Assets/Scenes/Main.unity',
  'Assets/Scenes/Main.unity.meta',
  'Assets/Scripts/GameConfig.cs',
  'Assets/Scripts/GameSim.cs',
  'Assets/Scripts/GameBootstrap.cs',
  'Assets/Scripts/ScreenshotRunner.cs',
  'Assets/Editor/EditorVerifier.cs',
  'Assets/Editor/ProjectBuilder.cs',
  'Assets/Editor/ScreenshotCapture.cs',
  'Assets/Resources/GameConfig.json',
  'README.md',
] as const;

export interface UnityGameConfig {
  name: string;
  arena: { width: number; height: number };
  player: { hp: number; damage: number; speed: number; attack_range: number };
  enemy: { hp: number; damage: number; speed: number; attack_range: number };
}

export interface ComposeUnityOptions {
  outDir: string;
  templatesDir?: string;
  name?: string;
  force?: boolean;
  config?: Partial<UnityGameConfig>;
}

export interface ComposeUnityResult {
  outDir: string;
  files: string[];
  config: UnityGameConfig;
}

const DEFAULT_CONFIG: UnityGameConfig = {
  name: 'unity-m0',
  arena: { width: 960, height: 540 },
  player: { hp: 100, damage: 15, speed: 220, attack_range: 64 },
  enemy: { hp: 30, damage: 5, speed: 70, attack_range: 40 },
};

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`invalid Unity project JSON ${path}: ${(error as Error).message}`);
  }
}

export function composeUnityProject(options: ComposeUnityOptions): ComposeUnityResult {
  const templatesDir = resolve(
    options.templatesDir ?? join(process.cwd(), 'templates/unity-2d-m0'),
  );
  if (!existsSync(templatesDir)) {
    throw new Error(`Unity template directory not found: ${templatesDir}`);
  }
  const outDir = resolve(options.outDir);
  if (
    outDir === templatesDir ||
    outDir.startsWith(templatesDir + sep) ||
    templatesDir.startsWith(outDir + sep)
  ) {
    throw new Error('Unity output must not be the template directory or its parent');
  }
  if (existsSync(outDir)) {
    if (!statSync(outDir).isDirectory()) {
      throw new Error(`Unity output path is not a directory: ${outDir}`);
    }
    if (readdirSync(outDir).length > 0 && !options.force) {
      throw new Error(`refusing to overwrite non-empty ${outDir}; pass --force`);
    }
  }

  const config: UnityGameConfig = {
    ...DEFAULT_CONFIG,
    ...options.config,
    name: options.name ?? options.config?.name ?? DEFAULT_CONFIG.name,
    arena: { ...DEFAULT_CONFIG.arena, ...options.config?.arena },
    player: { ...DEFAULT_CONFIG.player, ...options.config?.player },
    enemy: { ...DEFAULT_CONFIG.enemy, ...options.config?.enemy },
  };
  const stage = `${outDir}.tmp-${process.pid}-${Date.now()}`;
  rmSync(stage, { recursive: true, force: true });
  try {
    mkdirSync(stage, { recursive: true });
    cpSync(templatesDir, stage, { recursive: true });
    const missing = UNITY_PROJECT_FILES.filter(
      (file) => file !== 'Assets/Resources/GameConfig.json' && !existsSync(join(stage, file)),
    );
    if (missing.length > 0) {
      throw new Error(`Unity template is incomplete: missing ${missing.join(', ')}`);
    }
    mkdirSync(join(stage, 'Assets/Resources'), { recursive: true });
    writeFileSync(
      join(stage, 'Assets/Resources/GameConfig.json'),
      `${JSON.stringify(config, null, 2)}\n`,
      'utf8',
    );
    const backup = `${outDir}.bak-${process.pid}-${Date.now()}`;
    if (existsSync(outDir)) renameSync(outDir, backup);
    try {
      renameSync(stage, outDir);
      rmSync(backup, { recursive: true, force: true });
    } catch (error) {
      rmSync(outDir, { recursive: true, force: true });
      if (existsSync(backup)) renameSync(backup, outDir);
      throw error;
    }
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
  return { outDir, files: [...UNITY_PROJECT_FILES], config };
}

export function readUnityConfig(projectDir: string): UnityGameConfig {
  const path = join(projectDir, 'Assets/Resources/GameConfig.json');
  return readJson(path) as unknown as UnityGameConfig;
}

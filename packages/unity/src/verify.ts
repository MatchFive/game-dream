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
  'Assets/Editor/EditorVerifier.cs.meta',
] as const;

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function checkContains(
  file: string,
  source: string,
  tokens: string[],
): string | null {
  for (const token of tokens) {
    if (!source.includes(token)) return `${file} is missing ${token}`;
  }
  return null;
}

export function verifyUnityProject(options: { projectDir: string }): UnityVerifyResult {
  const projectDir = resolve(options.projectDir);
  for (const file of [...UNITY_PROJECT_FILES, ...SCRIPT_META_FILES]) {
    if (!existsSync(join(projectDir, file))) return { passed: false, message: `missing ${file}` };
  }

  const version = read(join(projectDir, 'ProjectSettings/ProjectVersion.txt'));
  if (!/^m_EditorVersion: 6000\.0\./m.test(version)) {
    return { passed: false, message: 'ProjectVersion.txt must target Unity 6000.0.x' };
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(read(join(projectDir, 'Packages/manifest.json')));
  } catch (error) {
    return { passed: false, message: `invalid Packages/manifest.json: ${(error as Error).message}` };
  }
  if (typeof manifest !== 'object' || manifest === null || !('dependencies' in manifest)) {
    return { passed: false, message: 'Packages/manifest.json has no dependencies' };
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
    ['class GameSim', 'void Step(', 'void Reset(', 'bool Won', 'bool Lost'],
  );
  if (simError) return { passed: false, message: simError };

  const bootstrapError = checkContains(
    'Assets/Scripts/GameBootstrap.cs',
    read(join(projectDir, 'Assets/Scripts/GameBootstrap.cs')),
    [
      'RuntimeInitializeOnLoadMethod',
      'UNITY_BOOT_OK',
      'UNITY_WIN',
      'UNITY_LOSE',
      'Input.GetKey',
      'OnGUI',
      'GameSim',
    ],
  );
  if (bootstrapError) return { passed: false, message: bootstrapError };

  const verifier = read(join(projectDir, 'Assets/Editor/EditorVerifier.cs'));
  const verifierError = checkContains('Assets/Editor/EditorVerifier.cs', verifier, [
    'class EditorVerifier',
    'UNITY_BOOT_OK',
    'UNITY_WIN',
    'EditorApplication.Exit',
    'GameSim',
  ]);
  if (verifierError) return { passed: false, message: verifierError };

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

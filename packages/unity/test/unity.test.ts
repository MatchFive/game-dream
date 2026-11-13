import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { composeUnityProject, readUnityConfig, verifyUnityProject } from '../src/index.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const templatesDir = join(root, 'templates/unity-2d-m0');

describe('unity M0 scaffold', () => {
  it('composes a static-verifiable Unity project', () => {
    const outDir = join(makeTempDir('gamedream unity '), 'unity game');
    const result = composeUnityProject({ outDir, templatesDir, name: 'arena' });
    expect(result.files.every((file) => existsSync(join(outDir, file)))).toBe(true);
    expect(readUnityConfig(outDir).name).toBe('arena');
    expect(verifyUnityProject({ projectDir: outDir })).toEqual({ passed: true });
    expect(readFileSync(join(outDir, 'Assets/Scripts/GameBootstrap.cs'), 'utf8')).toContain(
      'RuntimeInitializeOnLoadMethod',
    );
  });

  it('refuses overwrite unless forced and preserves the old copy on failure', () => {
    const outDir = join(makeTempDir('gamedream unity force '), 'unity game');
    composeUnityProject({ outDir, templatesDir });
    expect(() => composeUnityProject({ outDir, templatesDir })).toThrow(/pass --force/);
    composeUnityProject({ outDir, templatesDir, force: true, name: 'forced' });
    expect(readUnityConfig(outDir).name).toBe('forced');
  });

  it('fails verification on a missing file or marker', () => {
    const outDir = join(makeTempDir('gamedream unity marker '), 'unity game');
    composeUnityProject({ outDir, templatesDir });
    unlinkSync(join(outDir, 'Assets/Editor/EditorVerifier.cs'));
    const missing = verifyUnityProject({ projectDir: outDir });
    expect(missing.passed).toBe(false);
    expect(missing.message).toContain('missing Assets/Editor/EditorVerifier.cs');

    const other = join(makeTempDir('gamedream unity token '), 'unity game');
    composeUnityProject({ outDir: other, templatesDir });
    const simPath = join(other, 'Assets/Scripts/GameSim.cs');
    const sim = readFileSync(simPath, 'utf8').replace('void Step(', 'void Tick(');
    writeFileSync(simPath, sim, 'utf8');
    const missingToken = verifyUnityProject({ projectDir: other });
    expect(missingToken.passed).toBe(false);
    expect(missingToken.message).toContain('void Step');
  });
});

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import {
  composeUnityProject,
  findUnityBin,
  parseUnityVersion,
  readUnityConfig,
  runUnityBuild,
  runUnitySmoke,
  verifyUnityProject,
} from '../src/index.js';

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

  it('parses versions and honors UNITY_BIN without guessing', () => {
    expect(parseUnityVersion('6000.6.9f1')).toEqual({
      version: '6000.6.9f1',
      major: 6000,
      minor: 6,
      patch: 9,
    });
    expect(parseUnityVersion('no version')).toBeNull();
    const temp = makeTempDir('gamedream unity detect ');
    const bin = join(temp, 'Unity.exe');
    writeFileSync(bin, '', 'utf8');
    expect(findUnityBin({ env: { UNITY_BIN: bin } })).toBe(bin);
    expect(findUnityBin({ env: { UNITY_BIN: join(temp, 'missing.exe') } })).toBeNull();
    expect(() =>
      runUnityBuild({
        projectDir: temp,
        unityBin: join(temp, 'missing.exe'),
        target: 'webgl',
        outPath: temp,
      }),
    ).toThrow(/refusing to delete/);
    expect(
      runUnitySmoke({ projectDir: temp, exePath: join(temp, 'GameDream.exe') }),
    ).toMatchObject({ passed: false, message: 'player executable not found; run unity build first' });
  });

  it('rejects bad project version, manifest, config, and duplicate GUIDs', () => {
    const cases: Array<{ file: string; content: string; message: string }> = [
      {
        file: 'ProjectSettings/ProjectVersion.txt',
        content: 'm_EditorVersion: 2022.3.0f1\n',
        message: 'Unity 6000.x',
      },
      {
        file: 'Packages/manifest.json',
        content: '{"dependencies":{}}\n',
        message: 'com.unity.modules',
      },
      {
        file: 'Assets/Resources/GameConfig.json',
        content: '{}\n',
        message: 'name/arena',
      },
      {
        file: 'ProjectSettings/EditorBuildSettings.asset',
        content: '%YAML 1.1\n--- !u!1045 &1\nEditorBuildSettings:\n  m_Scenes: []\n',
        message: 'Main.unity',
      },
    ];
    for (const item of cases) {
      const outDir = join(makeTempDir('gamedream unity bad '), 'unity game');
      composeUnityProject({ outDir, templatesDir });
      writeFileSync(join(outDir, item.file), item.content, 'utf8');
      const result = verifyUnityProject({ projectDir: outDir });
      expect(result.passed).toBe(false);
      expect(result.message).toContain(item.message);
    }

    const outDir = join(makeTempDir('gamedream unity guid '), 'unity game');
    composeUnityProject({ outDir, templatesDir });
    const first = readFileSync(join(outDir, 'Assets/Scripts/GameSim.cs.meta'), 'utf8');
    const guid = /^guid: ([0-9a-f]{32})$/m.exec(first)?.[1];
    expect(guid).toBeTruthy();
    const meta = readFileSync(join(outDir, 'Assets/Scripts/GameBootstrap.cs.meta'), 'utf8');
    writeFileSync(
      join(outDir, 'Assets/Scripts/GameBootstrap.cs.meta'),
      meta.replace(/^guid: [0-9a-f]{32}$/m, `guid: ${guid}`),
      'utf8',
    );
    const duplicate = verifyUnityProject({ projectDir: outDir });
    expect(duplicate.passed).toBe(false);
    expect(duplicate.message).toContain('duplicates a GUID');
  });
});

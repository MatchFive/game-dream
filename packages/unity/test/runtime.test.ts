import { describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import {
  composeUnityProject,
  detectUnity,
  hasUnityMarker,
  runUnityBuild,
  runUnityScreenshot,
  runUnitySmoke,
  runUnityVerifier,
} from '../src/index.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const unityBin = process.env.UNITY_BIN;

function buildDir(): string {
  if (process.platform === 'win32') {
    mkdirSync('C:\\temp', { recursive: true });
    return join('C:\\temp', `gd-unity-${process.pid}-${Date.now()}`, 'unity game');
  }
  return join(makeTempDir('gamedream unity artifacts '), 'unity game');
}

describe('unity runtime parsing', () => {
  it('matches only exact marker lines', () => {
    expect(hasUnityMarker('noise\nUNITY_SIM_OK\nUNITY_WIN', 'UNITY_SIM_OK')).toBe(true);
    expect(hasUnityMarker('prefix UNITY_WIN', 'UNITY_WIN')).toBe(false);
    expect(hasUnityMarker('unrelated', 'UNITY_SIM_OK')).toBe(false);
  });
});

describe.skipIf(!unityBin)('unity runtime', () => {
  it('runs EditorVerifier and emits both markers', () => {
    const outDir = join(makeTempDir('gamedream unity runtime '), 'unity game');
    composeUnityProject({
      outDir,
      templatesDir: join(root, 'templates/unity-2d-m0'),
      name: 'runtime',
    });
    const unity = detectUnity({ bin: unityBin });
    expect(unity).not.toBeNull();
    const result = runUnityVerifier({
      projectDir: outDir,
      unityBin: unity!.bin,
      timeoutMs: 180_000,
    });
    expect(result.message).toBeUndefined();
    expect(result.passed).toBe(true);
    expect(result.stdout).toContain('UNITY_SIM_OK');
    expect(result.stdout).toContain('UNITY_WIN');
  }, 200_000);

  it('loads a staged BGM from StreamingAssets in the survivor runtime', () => {
    const outDir = join(makeTempDir('gamedream unity bgm '), 'unity game');
    composeUnityProject({
      outDir,
      templatesDir: join(root, 'templates/unity-survivor'),
      name: 'bgm-runtime',
    });
    const target = join(outDir, 'Assets/StreamingAssets/game/build-assets');
    mkdirSync(join(target, 'studio'), { recursive: true });
    cpSync(join(root, 'modules/system.survivor/assets/bgm.mp3'), join(target, 'studio/bgm.mp3'));
    writeFileSync(
      join(target, 'manifest.json'),
      JSON.stringify({
        version: 1,
        assets: [{
          id: 'bgm',
          name: 'Fixture BGM',
          file: 'game/build-assets/studio/bgm.mp3',
          source: 'module',
          kind: 'audio',
          mime: 'audio/mpeg',
        }],
      }),
      'utf8',
    );
    const unity = detectUnity({ bin: unityBin });
    expect(unity).not.toBeNull();
    const build = runUnityBuild({
      projectDir: outDir,
      unityBin: unity!.bin,
      timeoutMs: 300_000,
    });
    expect(build.passed).toBe(true);
    const smoke = runUnitySmoke({ projectDir: outDir, exePath: build.outputPath });
    expect(smoke.passed).toBe(true);
    expect(readFileSync(smoke.logPath, 'utf8')).toContain('UNITY_BGM_OK');
  }, 400_000);

  it('loads a staged BGM from StreamingAssets in a genre runtime', () => {
    const outDir = join(makeTempDir('gamedream unity genre bgm '), 'unity game');
    composeUnityProject({
      outDir,
      templatesDir: join(root, 'templates/unity-platformer'),
      name: 'platformer-bgm-runtime',
    });
    const target = join(outDir, 'Assets/StreamingAssets/game/build-assets');
    mkdirSync(join(target, 'studio'), { recursive: true });
    cpSync(join(root, 'modules/system.survivor/assets/bgm.mp3'), join(target, 'studio/bgm.mp3'));
    writeFileSync(
      join(target, 'manifest.json'),
      JSON.stringify({
        version: 1,
        assets: [{
          id: 'bgm',
          name: 'Fixture BGM',
          file: 'game/build-assets/studio/bgm.mp3',
          source: 'module',
          kind: 'audio',
          mime: 'audio/mpeg',
        }],
      }),
      'utf8',
    );
    const unity = detectUnity({ bin: unityBin });
    expect(unity).not.toBeNull();
    const build = runUnityBuild({
      projectDir: outDir,
      unityBin: unity!.bin,
      timeoutMs: 300_000,
    });
    expect(build.passed).toBe(true);
    const smoke = runUnitySmoke({ projectDir: outDir, exePath: build.outputPath });
    expect(smoke.passed).toBe(true);
    expect(readFileSync(smoke.logPath, 'utf8')).toContain('UNITY_BGM_OK');
  }, 400_000);

  it('builds and screenshots fresh artifacts', () => {
    const outDir = buildDir();
    composeUnityProject({
      outDir,
      templatesDir: join(root, 'templates/unity-2d-m0'),
      name: 'artifacts',
    });
    const unity = detectUnity({ bin: unityBin });
    expect(unity).not.toBeNull();
    const build = runUnityBuild({
      projectDir: outDir,
      unityBin: unity!.bin,
      timeoutMs: 300_000,
    });
    expect(build.message).toBeUndefined();
    expect(build.passed).toBe(true);
    expect(existsSync(build.outputPath)).toBe(true);
    const smoke = runUnitySmoke({ projectDir: outDir, exePath: build.outputPath });
    expect(smoke.message).toBeUndefined();
    expect(smoke.passed).toBe(true);
    expect(readFileSync(smoke.logPath, 'utf8')).toContain('UNITY_SMOKE_OK');
    const shot = runUnityScreenshot({
      projectDir: outDir,
      unityBin: unity!.bin,
      timeoutMs: 180_000,
    });
    expect(shot.message).toBeUndefined();
    expect(shot.passed).toBe(true);
    expect(existsSync(shot.imagePath)).toBe(true);
    rmSync(dirname(outDir), { recursive: true, force: true });
  }, 400_000);
});

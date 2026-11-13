import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import {
  composeUnityProject,
  detectUnity,
  hasUnityMarker,
  runUnityVerifier,
} from '../src/index.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const unityBin = process.env.UNITY_BIN;

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
});

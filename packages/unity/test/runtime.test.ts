import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { composeUnityProject, detectUnity, runUnityVerifier } from '../src/index.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const unityBin = process.env.UNITY_BIN;

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

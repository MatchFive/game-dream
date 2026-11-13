import { describe, expect, it } from 'vitest';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import {
  unityBuildCommand,
  unityComposeCommand,
  unityScreenshotCommand,
  unitySmokeCommand,
  unityVerifyCommand,
} from '../src/commands/unity.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('unity commands', () => {
  it('composes and verifies a project, then reports a stripped one', () => {
    const outDir = join(makeTempDir('gamedream unity cli '), 'unity game');
    unityComposeCommand({
      outDir,
      templatesDir: join(root, 'templates/unity-2d-m0'),
      name: 'cli',
    });
    expect(unityVerifyCommand({ projectDir: outDir }).passed).toBe(true);
    const missingUnity = unityVerifyCommand({
      projectDir: outDir,
      runtime: true,
      unityBin: join(outDir, 'missing-unity.exe'),
    });
    expect(missingUnity.passed).toBe(false);
    expect(missingUnity.exitCode).toBe(3);
    const missingBuild = unityBuildCommand({
      projectDir: outDir,
      unityBin: join(outDir, 'missing-unity.exe'),
    });
    expect(missingBuild.exitCode).toBe(3);
    const missingShot = unityScreenshotCommand({
      projectDir: outDir,
      unityBin: join(outDir, 'missing-unity.exe'),
    });
    expect(missingShot.exitCode).toBe(3);
    const missingWebGL = unityBuildCommand({
      projectDir: outDir,
      target: 'webgl',
      unityBin: join(outDir, 'missing-unity.exe'),
    });
    expect(missingWebGL.exitCode).toBe(3);
    const missingSmoke = unitySmokeCommand({ projectDir: outDir });
    expect(missingSmoke.exitCode).toBe(1);
    unlinkSync(join(outDir, 'Assets/Editor/EditorVerifier.cs'));
    const failed = unityVerifyCommand({ projectDir: outDir });
    expect(failed.passed).toBe(false);
    expect(failed.message).toContain('EditorVerifier');
  });
});

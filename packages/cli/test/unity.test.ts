import { describe, expect, it } from 'vitest';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { unityComposeCommand, unityVerifyCommand } from '../src/commands/unity.js';

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
    unlinkSync(join(outDir, 'Assets/Editor/EditorVerifier.cs'));
    const failed = unityVerifyCommand({ projectDir: outDir });
    expect(failed.passed).toBe(false);
    expect(failed.message).toContain('EditorVerifier');
  });
});

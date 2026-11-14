import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { unityComposeCommand, unityVerifyCommand } from '../src/commands/unity.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('Unity survivor', () => {
  it('composes and statically verifies', () => {
    const outDir = join(makeTempDir('gamedream unity survivor '), 'game');
    unityComposeCommand({
      outDir,
      templatesDir: join(root, 'templates/unity-survivor'),
      name: 'ember-survivor',
    });
    expect(unityVerifyCommand({ projectDir: outDir }).passed).toBe(true);
  });
});

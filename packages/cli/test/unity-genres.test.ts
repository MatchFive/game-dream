import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { unityComposeCommand, unityVerifyCommand } from '../src/commands/unity.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const templates = [
  'unity-roguelike',
  'unity-tower-defense',
  'unity-puzzle',
  'unity-platformer',
  'unity-shooter',
];

describe('Unity genre coverage', () => {
  for (const template of templates) {
    it(`composes and statically verifies: ${template}`, () => {
      const outDir = join(makeTempDir(`gamedream ${template} `), 'game');
      unityComposeCommand({
        outDir,
        templatesDir: join(root, 'templates', template),
        name: template,
      });
      expect(unityVerifyCommand({ projectDir: outDir }).passed).toBe(true);
    });
  }
});

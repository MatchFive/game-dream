import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { webComposeCommand, webVerifyCommand } from '../src/commands/web.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const templates = ['web-roguelike', 'web-tower-defense', 'web-puzzle'];

describe('Web genre coverage', () => {
  for (const template of templates) {
    it(`composes and wins: ${template}`, () => {
      const outDir = join(makeTempDir(`gamedream ${template} `), 'game');
      webComposeCommand({
        outDir,
        templatesDir: join(root, 'templates', template),
        name: template,
      });
      const verified = webVerifyCommand({ projectDir: outDir, frames: 1800 });
      expect(verified.passed).toBe(true);
      expect(verified.stdout).toContain('WEB_BOOT_OK');
      expect(verified.stdout).toContain('WEB_WIN');
    });
  }
});

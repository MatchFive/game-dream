import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { webComposeCommand, webVerifyCommand } from '../src/commands/web.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('Web platformer', () => {
  it('composes and reaches the flag headlessly', () => {
    const outDir = join(makeTempDir('gamedream web platformer '), 'game');
    webComposeCommand({
      outDir,
      templatesDir: join(root, 'templates/web-platformer'),
      name: 'skyline-runner',
    });
    const verified = webVerifyCommand({ projectDir: outDir, frames: 1800 });
    expect(verified.passed).toBe(true);
    expect(verified.stdout).toContain('WEB_BOOT_OK');
    expect(verified.stdout).toContain('WEB_WIN');
  });
});

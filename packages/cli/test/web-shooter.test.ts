import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { webComposeCommand, webVerifyCommand } from '../src/commands/web.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('Web shooter', () => {
  it('composes and clears all waves headlessly', () => {
    const outDir = join(makeTempDir('gamedream web shooter '), 'game');
    webComposeCommand({
      outDir,
      templatesDir: join(root, 'templates/web-shooter'),
      name: 'neon-drift',
    });
    const verified = webVerifyCommand({ projectDir: outDir, frames: 1800 });
    expect(verified.passed).toBe(true);
    expect(verified.stdout).toContain('WEB_BOOT_OK');
    expect(verified.stdout).toContain('WEB_WIN');
  });
});

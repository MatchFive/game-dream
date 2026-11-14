import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { webComposeCommand, webVerifyCommand } from '../src/commands/web.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('Web survivor', () => {
  it('composes and wins headlessly', () => {
    const outDir = join(makeTempDir('gamedream web survivor '), 'game');
    const result = webComposeCommand({
      outDir,
      templatesDir: join(root, 'templates/web-survivor'),
      name: 'ember-survivor',
    });
    expect(result.config.name).toBe('ember-survivor');
    const verified = webVerifyCommand({ projectDir: outDir, frames: 1800 });
    expect(verified.passed).toBe(true);
    expect(verified.stdout).toContain('WEB_BOOT_OK');
    expect(verified.stdout).toContain('WEB_WIN');
  });
});

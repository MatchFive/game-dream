import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { composeWebProject, verifyWebProject } from '../src/index.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const templatesDir = join(root, 'templates/web-m0');

describe('web M0', () => {
  it('composes a standalone project and wins headlessly', () => {
    const outDir = join(makeTempDir('gamedream web '), 'web game');
    const result = composeWebProject({ outDir, templatesDir, name: 'arena' });
    expect(result.files.every((file) => existsSync(join(outDir, file)))).toBe(true);
    const config = JSON.parse(readFileSync(join(outDir, 'game.json'), 'utf8'));
    expect(config.name).toBe('arena');
    expect(config.arena.width).toBe(960);

    const verified = verifyWebProject({ projectDir: outDir });
    expect(verified.passed).toBe(true);
    expect(verified.stdout).toContain('WEB_BOOT_OK');
    expect(verified.stdout).toContain('WEB_WIN');
  });

  it('refuses overwrite unless forced', () => {
    const outDir = join(makeTempDir('gamedream web overwrite '), 'web game');
    composeWebProject({ outDir, templatesDir });
    expect(() => composeWebProject({ outDir, templatesDir })).toThrow(/pass --force/);
    expect(() =>
      composeWebProject({ outDir, templatesDir, force: true }),
    ).not.toThrow();
  });

  it('fails verification when a marker is missing', () => {
    const outDir = join(makeTempDir('gamedream web marker '), 'web game');
    composeWebProject({ outDir, templatesDir });
    writeFileSync(join(outDir, 'sim-run.mjs'), "console.log('WEB_BOOT_OK');\n", 'utf8');
    const verified = verifyWebProject({ projectDir: outDir });
    expect(verified.passed).toBe(false);
    expect(verified.message).toContain('WEB_WIN');
  });
});

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeProject } from '../src/index.js';
import { makeTempDir } from '@gamedream/testing';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('export presets', () => {
  it('creates Windows/Linux/Web presets and preserves user edits', async () => {
    const outDir = join(makeTempDir('gamedream presets '), 'game');
    await composeProject({
      specPath: join(root, 'fixtures/specs/minimal.yaml'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
    });
    const presets = join(outDir, 'export_presets.cfg');
    const first = readFileSync(presets, 'utf8');
    expect(first).toContain('name="Windows Desktop"');
    expect(first).toContain('name="Linux"');
    expect(first).toContain('name="Web"');
    expect(first).toContain('export_path="build/windows/');

    writeFileSync(presets, `${first}\n# user edit\n`, 'utf8');
    await composeProject({
      specPath: join(root, 'fixtures/specs/minimal.yaml'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
    });
    expect(readFileSync(presets, 'utf8')).toContain('# user edit');
    expect(existsSync(presets)).toBe(true);
  });
});

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '@gamedream/testing';
import { exportTemplatesRoot, findExportTemplates, templateVersion } from '../src/templates.js';

describe('Godot export templates', () => {
  it('normalizes versions and finds platform files', () => {
    expect(templateVersion('4.4.1.stable.official.49a5bc7b6')).toBe('4.4.1.stable');
    const env = { APPDATA: makeTempDir('gamedream templates ') };
    const dir = join(exportTemplatesRoot(env, 'win32'), '4.4.1.stable');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'windows_release_x86_64.exe'), 'template');
    writeFileSync(join(dir, 'web_release.zip'), 'template');
    const status = findExportTemplates('4.4.1.stable.official', env, 'win32');
    expect(status.installed).toBe(true);
    expect(status.platforms.windows).toBe(true);
    expect(status.platforms.web).toBe(true);
    expect(status.platforms.linux).toBe(false);
  });

  it('reports missing templates without throwing', () => {
    const env = { APPDATA: makeTempDir('gamedream templates missing ') };
    const status = findExportTemplates('4.4.1.stable', env, 'win32');
    expect(status.installed).toBe(false);
    expect(status.dir).toContain('4.4.1.stable');
  });
});

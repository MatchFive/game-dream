import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { webComposeCommand, webVerifyCommand } from '../src/commands/web.js';
import { unityComposeCommand, unityVerifyCommand } from '../src/commands/unity.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('P1 cross-engine matrix', () => {
  it('keeps the survivor slice playable on Web and Unity', async () => {
    const webDir = join(makeTempDir('gamedream p1 web '), 'game');
    webComposeCommand({
      outDir: webDir,
      templatesDir: join(root, 'templates/web-survivor'),
      name: 'ember-survivor',
    });
    const web = webVerifyCommand({ projectDir: webDir, frames: 1800 });
    expect(web.passed).toBe(true);
    expect(web.stdout).toContain('WEB_BOOT_OK');
    expect(web.stdout).toContain('WEB_WIN');

    const unityDir = join(makeTempDir('gamedream p1 unity '), 'game');
    unityComposeCommand({
      outDir: unityDir,
      templatesDir: join(root, 'templates/unity-survivor'),
      name: 'ember-survivor',
    });
    const unity = unityVerifyCommand({ projectDir: unityDir });
    expect(unity.passed).toBe(true);
    expect(existsSync(join(unityDir, 'Assets/Scripts/SurvivorSim.cs'))).toBe(true);
  }, 30_000);
});

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import {
  captureWebScreenshot,
  composeWebProject,
  findWebBrowser,
} from '../src/index.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const templatesDir = join(root, 'templates/web-m0');
const browser = findWebBrowser();

describe('web screenshot', () => {
  it('reports a missing browser', async () => {
    const outDir = join(makeTempDir('gamedream web no browser '), 'web game');
    composeWebProject({ outDir, templatesDir });
    const result = await captureWebScreenshot({
      projectDir: outDir,
      env: { PATH: '' },
    });
    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(3);
  });
});

describe.skipIf(!browser)('web screenshot browser', () => {
  it('captures a non-blank M1 Canvas screenshot', async () => {
    const outDir = join(makeTempDir('gamedream web screenshot '), 'web game');
    composeWebProject({
      outDir,
      templatesDir,
      contentDir: join(root, 'templates/rpg-action-m1/content'),
      modulesDir: join(root, 'modules'),
      name: 'screenshot',
    });
    const outPath = join(outDir, 'screenshot.png');
    const result = await captureWebScreenshot({ projectDir: outDir, outPath });
    expect(result.passed).toBe(true, result.message);
    expect(result.imagePath).toBe(outPath);
    expect(result.metrics?.width).toBe(1280);
    expect(result.metrics?.height).toBe(720);
    expect(result.metrics?.colors).toBeGreaterThan(8);
    expect(result.metrics?.center_colors).toBeGreaterThanOrEqual(4);
    expect(result.metrics?.non_black).toBeGreaterThan(0);
  }, 30_000);
});

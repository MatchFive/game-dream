import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import {
  webComposeCommand,
  webPackageCommand,
  webScreenshotCommand,
  webVerifyCommand,
  webVerifyVisualCommand,
} from '../src/commands/web.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('web CLI commands', () => {
  it('composes and verifies a web project', () => {
    const outDir = join(makeTempDir('gamedream web cli '), 'web game');
    webComposeCommand({
      outDir,
      templatesDir: join(root, 'templates/web-m0'),
      name: 'cli',
    });
    const result = webVerifyCommand({ projectDir: outDir });
    expect(result.passed).toBe(true);
  });

  it('packages a verified project', () => {
    const outDir = join(makeTempDir('gamedream web cli package '), 'web game');
    webComposeCommand({ outDir, templatesDir: join(root, 'templates/web-m0') });
    const release = join(makeTempDir('gamedream web cli release '), 'release');
    const result = webPackageCommand({ projectDir: outDir, outDir: release });
    expect(result.entry).toBe('index.html');
    expect(result.files.length).toBeGreaterThan(8);
  });

  it('surfaces missing browsers for screenshot commands', async () => {
    const outDir = join(makeTempDir('gamedream web cli visual '), 'web game');
    webComposeCommand({ outDir, templatesDir: join(root, 'templates/web-m0') });
    const screenshot = await webScreenshotCommand({
      projectDir: outDir,
      browserBin: '/missing/browser',
    });
    expect(screenshot.exitCode).toBe(3);
    const visual = await webVerifyVisualCommand({
      projectDir: outDir,
      browserBin: '/missing/browser',
    });
    expect(visual.exitCode).toBe(3);
  });
});

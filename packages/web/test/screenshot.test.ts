import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import {
  captureWebScreenshot,
  composeWebProject,
  findWebBrowser,
  readPngMetrics,
  verifyWebVisual,
} from '../src/index.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const templatesDir = join(root, 'templates/web-m0');
const browser = findWebBrowser();

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function makePng(width: number, height: number, rgba: boolean): Buffer {
  const channels = rgba ? 4 : 3;
  const raw = Buffer.alloc((width * channels + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * channels + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const at = row + 1 + x * channels;
      raw[at] = (x * 37) & 255;
      raw[at + 1] = (y * 53) & 255;
      raw[at + 2] = 180;
      if (rgba) raw[at + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = rgba ? 6 : 2;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

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

  it('decodes RGB and RGBA PNG metrics', () => {
    const dir = makeTempDir('gamedream web png ');
    for (const rgba of [false, true]) {
      const path = join(dir, `${rgba ? 'rgba' : 'rgb'}.png`);
      writeFileSync(path, makePng(8, 8, rgba));
      const metrics = readPngMetrics(path);
      expect(metrics).toMatchObject({ width: 8, height: 8 });
      expect(metrics?.colors).toBeGreaterThan(1);
    }
  });

  it('validates project and browser precedence', async () => {
    expect(findWebBrowser({ env: {}, platform: 'win32' })).toBeUndefined();
    expect(findWebBrowser({ explicit: '/missing/browser', env: {}, platform: 'win32' })).toBeUndefined();
    const missing = await captureWebScreenshot({
      projectDir: join(makeTempDir('gamedream web missing project '), 'nope'),
      env: {},
    });
    expect(missing.exitCode).toBe(1);
    expect(missing.message).toContain('index.html');
  });
});

describe.skipIf(!browser)('web screenshot browser', () => {
  it('captures the flat default M0 renderer and passes the visual gate', async () => {
    const outDir = join(makeTempDir('gamedream web screenshot m0 '), 'web game');
    composeWebProject({ outDir, templatesDir });
    const captured = await captureWebScreenshot({ projectDir: outDir });
    expect(captured.passed).toBe(true, captured.message);
    const visual = await verifyWebVisual({ projectDir: outDir, outPath: join(outDir, 'visual.png') });
    expect(visual.passed).toBe(true, visual.message);
  }, 30_000);

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

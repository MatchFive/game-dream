import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir } from '@gamedream/testing';
import { runScreenshot } from '../src/run-screenshot.js';
import type { CommandRunner } from '../src/runner.js';

const godot = { bin: 'godot', version: '4.4.1', major: 4, minor: 4 };

describe('runScreenshot', () => {
  it('runs windowed and copies the captured PNG', async () => {
    const dir = makeTempDir('gamedream screenshot ');
    const source = join(dir, 'source.png');
    const outPath = join(dir, 'out', 'shot.png');
    writeFileSync(source, 'png-bytes', 'utf8');
    let args: string[] = [];
    const runner: CommandRunner = {
      async run(_command, commandArgs) {
        args = commandArgs;
        return {
          exitCode: 0,
          stdout: [
            `GAMEDREAM_SCREENSHOT_PATH=${source}`,
            'GAMEDREAM_SCREENSHOT_METRICS={"width":1280,"height":720,"samples":100,"non_black":80,"colors":12,"center_colors":6}',
            'GAMEDREAM_SCREENSHOT_OK',
            '',
          ].join('\n'),
          stderr: '',
        };
      },
    };

    const result = await runScreenshot(dir, godot, { outPath, runner });
    expect(args).toContain('--screenshot');
    expect(args).not.toContain('--headless');
    expect(result.imagePath).toBe(outPath);
    expect(readFileSync(outPath, 'utf8')).toBe('png-bytes');
    expect(result.metrics).toMatchObject({ width: 1280, height: 720, colors: 12, center_colors: 6 });
  });

  it('reports missing markers', async () => {
    const dir = makeTempDir('gamedream screenshot missing ');
    const runner: CommandRunner = {
      async run() {
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    };
    const result = await runScreenshot(dir, godot, { runner });
    expect(result.imagePath).toBeUndefined();
    expect(result.metrics).toBeUndefined();
    expect(result.exitCode).toBe(0);
  });
});

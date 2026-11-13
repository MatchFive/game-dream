import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir } from '@gamedream/testing';
import type { CommandRunner } from '@gamedream/godot';
import { screenshotCommand } from '../src/commands/screenshot.js';

describe('screenshotCommand', () => {
  it('imports, runs, and copies the screenshot', async () => {
    const projectDir = makeTempDir('gamedream screenshot command ');
    const source = join(projectDir, 'capture.png');
    const outPath = join(projectDir, 'out.png');
    writeFileSync(source, 'png-bytes', 'utf8');
    const calls: string[][] = [];
    const runner: CommandRunner = {
      async run(_command, args) {
        calls.push(args);
        if (args[0] === '--version') {
          return { exitCode: 0, stdout: '4.4.1.stable.official\n', stderr: '' };
        }
        if (args.includes('--import')) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
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

    const { result } = await screenshotCommand({
      projectDir,
      outPath,
      runner,
    });
    expect(calls.some((args) => args.includes('--import'))).toBe(true);
    expect(result?.imagePath).toBe(outPath);
    expect(readFileSync(outPath, 'utf8')).toBe('png-bytes');
    expect(result?.metrics?.colors).toBe(12);
  });
});

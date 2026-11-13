import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import type { CommandRunner } from '@gamedream/godot';
import { FakeVisionProvider } from '@gamedream/agent';
import { composeCommand } from '../src/commands/compose.js';
import { exitCodeFor, verifyCommand } from '../src/commands/verify.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

async function composeM1(prefix: string) {
  const outDir = join(makeTempDir(prefix), 'visual game');
  await composeCommand({
    specPath: join(root, 'fixtures/specs/m1.yaml'),
    outDir,
    modulesDir: join(root, 'modules'),
    templatesDir: join(root, 'templates'),
  });
  return outDir;
}

function runnerFor(outDir: string, metrics: string): CommandRunner {
  const markers = JSON.parse(
    readFileSync(join(outDir, 'game/game.manifest.json'), 'utf8'),
  ).acceptance.markers as string[];
  const source = join(outDir, 'capture.png');
  writeFileSync(source, 'x'.repeat(2000), 'utf8');
  return {
    async run(_command, args) {
      if (args[0] === '--version') {
        return { exitCode: 0, stdout: '4.4.1.stable.official\n', stderr: '' };
      }
      if (args.includes('--import')) {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      if (args.includes('--screenshot')) {
        return {
          exitCode: 0,
          stdout: [
            `GAMEDREAM_SCREENSHOT_PATH=${source}`,
            `GAMEDREAM_SCREENSHOT_METRICS=${metrics}`,
            'GAMEDREAM_SCREENSHOT_OK',
            '',
          ].join('\n'),
          stderr: '',
        };
      }
      return { exitCode: 0, stdout: `${markers.join('\n')}\n`, stderr: '' };
    },
  };
}

describe('visual gate', () => {
  it('adds a passing G6 only with --visual', async () => {
    const outDir = await composeM1('gamedream visual pass ');
    const runner = runnerFor(
      outDir,
      '{"width":1280,"height":720,"samples":100,"non_black":80,"colors":12,"center_colors":6}',
    );
    const without = await verifyCommand({ projectDir: outDir, runner });
    expect(without.gates.G6).toBeUndefined();

    const withVisual = await verifyCommand({
      projectDir: outDir,
      runner,
      visual: true,
      visualOut: join(outDir, 'shot.png'),
    });
    expect(withVisual.gates.G3.status).toBe('pass');
    expect(withVisual.gates.G6?.status).toBe('pass');
    expect(exitCodeFor(withVisual)).toBe(0);
  });

  it('runs a fake vision review and implies --visual', async () => {
    const outDir = await composeM1('gamedream vision pass ');
    const runner = runnerFor(
      outDir,
      '{"width":1280,"height":720,"samples":100,"non_black":80,"colors":12,"center_colors":6}',
    );
    const report = await verifyCommand({
      projectDir: outDir,
      runner,
      vision: 'fake',
      visionProvider: new FakeVisionProvider(),
      visualOut: join(outDir, 'shot.png'),
    });
    expect(report.gates.G6?.status).toBe('pass');
    expect(report.gates.G6?.message).toContain('vision:fake');
  });

  it('fails G6 when the vision review is not readable', async () => {
    const outDir = await composeM1('gamedream vision fail ');
    const report = await verifyCommand({
      projectDir: outDir,
      runner: runnerFor(
        outDir,
        '{"width":1280,"height":720,"samples":100,"non_black":80,"colors":12,"center_colors":6}',
      ),
      vision: 'fake',
      visionProvider: new FakeVisionProvider({ review: { readable: false } }),
      visualOut: join(outDir, 'shot.png'),
    });
    expect(report.gates.G6?.status).toBe('fail');
    expect(report.gates.G6?.message).toContain('vision: not readable');
    expect(exitCodeFor(report)).toBe(2);
  });

  it('fails G6 on invalid metrics', async () => {
    const outDir = await composeM1('gamedream visual bad ');
    const report = await verifyCommand({
      projectDir: outDir,
      runner: runnerFor(outDir, '{"width":1280}'),
      visual: true,
      visualOut: join(outDir, 'shot.png'),
    });
    expect(report.gates.G6?.status).toBe('fail');
    expect(report.gates.G6?.message).toContain('invalid metrics');
    expect(exitCodeFor(report)).toBe(2);
  });
});

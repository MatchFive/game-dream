import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import type { CommandRunner } from '@gamedream/godot';
import {
  AgentError,
  FakeVisionProvider,
  type VisionProvider,
} from '@gamedream/agent';
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
  writeFileSync(
    source,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(2000),
    ]),
  );
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

  it('passes the copied PNG path to the provider', async () => {
    const outDir = await composeM1('gamedream vision path ');
    const provider: VisionProvider = {
      name: 'assert',
      async review(request) {
        expect(existsSync(request.imagePath)).toBe(true);
        expect(readFileSync(request.imagePath).subarray(0, 8)).toEqual(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        );
        return new FakeVisionProvider().review(request);
      },
    };
    const report = await verifyCommand({
      projectDir: outDir,
      runner: runnerFor(
        outDir,
        '{"width":1280,"height":720,"samples":100,"non_black":80,"colors":12,"center_colors":6}',
      ),
      vision: 'fake',
      visionProvider: provider,
      visualOut: join(outDir, 'shot.png'),
    });
    expect(report.gates.G6?.status).toBe('pass');
  });

  it('fails G6 on missing OpenAI keys and provider errors', async () => {
    const outDir = await composeM1('gamedream vision errors ');
    const missingKey = await verifyCommand({
      projectDir: outDir,
      runner: runnerFor(
        outDir,
        '{"width":1280,"height":720,"samples":100,"non_black":80,"colors":12,"center_colors":6}',
      ),
      vision: 'openai',
      env: {},
      visualOut: join(outDir, 'shot.png'),
    });
    expect(missingKey.gates.G6?.status).toBe('fail');
    expect(missingKey.gates.G6?.message).toContain('OPENAI_API_KEY');
    expect(exitCodeFor(missingKey)).toBe(2);

    const failing = await verifyCommand({
      projectDir: outDir,
      runner: runnerFor(
        outDir,
        '{"width":1280,"height":720,"samples":100,"non_black":80,"colors":12,"center_colors":6}',
      ),
      vision: 'fake',
      visionProvider: {
        name: 'bad',
        async review() {
          throw new AgentError('INVALID_VISION_REVIEW', 'bad review');
        },
      },
      visualOut: join(outDir, 'shot.png'),
    });
    expect(failing.gates.G6?.status).toBe('fail');
    expect(failing.gates.G6?.message).toContain('bad review');
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

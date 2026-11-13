import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { composeCommand } from '../src/commands/compose.js';
import { exitCodeFor, verifyCommand } from '../src/commands/verify.js';
import type { CommandRunner } from '@gamedream/godot';

const root = fileURLToPath(new URL('../../..', import.meta.url));

const bootOnly: CommandRunner = {
  async run(command, args) {
    if (args[0] === '--version') {
      return { exitCode: 0, stdout: '4.4.1.stable.official\n', stderr: '' };
    }
    return { exitCode: 0, stdout: 'GAMEDREAM_BOOT_OK\n', stderr: '' };
  },
};

describe('m0 verify markers', () => {
  it('fails G3 when an M0 template marker is missing', async () => {
    const outDir = join(makeTempDir('gamedream m0 verify '), 'm0 game');
    await composeCommand({
      specPath: join(root, 'fixtures/specs/m0.yaml'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
    });
    const report = await verifyCommand({
      projectDir: outDir,
      env: { GODOT_BIN: 'godot' },
      runner: bootOnly,
    });
    expect(report.gates.G3.status).toBe('fail');
    expect(report.gates.G3.message).toContain('GAMEDREAM_WIN');
    expect(exitCodeFor(report)).toBe(2);
  });

  it('fails G3 when an M1 template marker is missing', async () => {
    const outDir = join(makeTempDir('gamedream m1 verify '), 'm1 game');
    await composeCommand({
      specPath: join(root, 'fixtures/specs/m1.yaml'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
    });
    const report = await verifyCommand({
      projectDir: outDir,
      env: { GODOT_BIN: 'godot' },
      runner: bootOnly,
    });
    expect(report.gates.G3.status).toBe('fail');
    expect(report.gates.G3.message).toContain('GAMEDREAM_MAP_OK');
    expect(exitCodeFor(report)).toBe(2);
  });
});

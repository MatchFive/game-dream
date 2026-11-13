import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { makeTempDir } from '@gamedream/testing';
import { doctorCommand } from '../src/commands/doctor.js';
import { composeCommand } from '../src/commands/compose.js';
import { verifyCommand } from '../src/commands/verify.js';
import type { CommandRunner } from '@gamedream/godot';

const root = fileURLToPath(new URL('../../..', import.meta.url));

const fakeGodot: CommandRunner = {
  async run(command, args) {
    if (args[0] === '--version') {
      return { exitCode: 0, stdout: '4.4.1.stable.official\n', stderr: '' };
    }
    return { exitCode: 0, stdout: 'GAMEDREAM_BOOT_OK\nINVENTORY_COUNT=1\n', stderr: '' };
  },
};

describe('doctor', () => {
  it('reports Godot when available', async () => {
    const report = await doctorCommand({ env: { GODOT_BIN: 'godot' }, runner: fakeGodot });
    expect(report.godot?.version).toContain('4.4');
  });
});

describe('compose', () => {
  it('composes the fixture into a temp directory', async () => {
    const outDir = join(makeTempDir('gamedream cli '), 'my game');
    const result = await composeCommand({
      specPath: join(root, 'fixtures/specs/minimal.yaml'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
    });
    expect(result.order).toHaveLength(4);
    expect(readFileSync(join(outDir, 'game/_generated/main.tscn'), 'utf8')).toContain('hud.tscn');
  });
});

describe('verify', () => {
  it('passes G1–G3 with a fake Godot that emits the markers', async () => {
    const outDir = join(makeTempDir('gamedream verify '), 'my game');
    await composeCommand({
      specPath: join(root, 'fixtures/specs/minimal.yaml'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
    });
    const report = await verifyCommand({
      projectDir: outDir,
      env: { GODOT_BIN: 'godot' },
      runner: fakeGodot,
    });
    expect(report.gates.G1.status).toBe('pass');
    expect(report.gates.G2.status).toBe('pass');
    expect(report.gates.G3.status).toBe('pass');
  });

  it('skips G2/G3 when Godot is missing, without claiming pass', async () => {
    const outDir = join(makeTempDir('gamedream verify missing '), 'my game');
    await composeCommand({
      specPath: join(root, 'fixtures/specs/minimal.yaml'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
    });
    const missing: CommandRunner = {
      async run() {
        return { exitCode: 1, stdout: '', stderr: 'not found' };
      },
    };
    const report = await verifyCommand({ projectDir: outDir, env: {}, runner: missing });
    expect(report.gates.G1.status).toBe('pass');
    expect(report.gates.G2.status).toBe('skip');
    expect(report.gates.G3.status).toBe('skip');
  });
});

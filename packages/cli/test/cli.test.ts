import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { makeTempDir } from '@gamedream/testing';
import { doctorCommand } from '../src/commands/doctor.js';
import { templatesCommand } from '../src/commands/templates.js';
import { composeCommand } from '../src/commands/compose.js';
import { exitCodeFor, verifyCommand } from '../src/commands/verify.js';
import { formatCliError } from '../src/errors.js';
import { AgentError } from '@gamedream/agent';
import { ResolutionError } from '@gamedream/core';
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

describe('formatCliError', () => {
  it('maps a resolution error to a stable code, details, and exit 2', () => {
    const formatted = formatCliError(
      new ResolutionError('MISSING_MODULE', 'module not found: core.x', {
        module: 'core.x',
      }),
    );
    expect(formatted.message).toContain('MISSING_MODULE');
    expect(formatted.message).toContain('core.x');
    expect(formatted.exitCode).toBe(2);
  });

  it('maps AgentError codes to exit 3 for missing keys and exit 2 otherwise', () => {
    expect(formatCliError(new AgentError('MISSING_API_KEY', 'x')).exitCode).toBe(3);
    expect(formatCliError(new AgentError('INVALID_MODEL_JSON', 'x')).exitCode).toBe(2);
  });
});

describe('doctor', () => {
  it('reports Godot when available', async () => {
    const report = await doctorCommand({
      env: { GODOT_BIN: 'godot' },
      runner: fakeGodot,
      unity: null,
    });
    expect(report.godot?.version).toContain('4.4');
    expect(report.ok).toBe(true);
  });

  it('reports template command exit codes and missing-Godot JSON seam', async () => {
    const env = { GODOT_BIN: 'godot', APPDATA: makeTempDir('gamedream template command ') };
    const result = await templatesCommand({
      env,
      platform: 'win32',
      requested: 'windows',
      runner: fakeGodot,
    });
    expect(result.exitCode).toBe(1);
    expect(result.status?.requested).toBe('windows');
    const missing = await templatesCommand({ godot: null });
    expect(missing.exitCode).toBe(3);
    expect(missing.status).toBeNull();
  });

  it('reports export template status as a warning without changing doctor ok', async () => {
    const env = { GODOT_BIN: 'godot', APPDATA: makeTempDir('gamedream doctor templates ') };
    const report = await doctorCommand({ env, runner: fakeGodot, unity: null });
    expect(report.templates?.installed).toBe(false);
    expect(report.ok).toBe(true);
    expect(report.warnings.join(' ')).toContain('export templates');
  });

  it('fails when the detected Godot is older than 4.4', async () => {
    const oldGodot: CommandRunner = {
      async run(command, args) {
        if (args[0] === '--version') {
          return { exitCode: 0, stdout: '3.5.3.stable\n', stderr: '' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    };
    const report = await doctorCommand({
      env: { GODOT_BIN: 'godot' },
      runner: oldGodot,
      unity: null,
    });
    expect(report.ok).toBe(false);
    expect(report.problems.join(' ')).toContain('4.4');
  });

  it('reports Unity and provider configuration without exposing the key', async () => {
    const unity = {
      bin: 'unity',
      version: '6000.6.9f1',
      major: 6000,
      minor: 6,
      patch: 9,
    };
    const withKey = await doctorCommand({
      env: {
        GODOT_BIN: 'godot',
        OPENAI_API_KEY: 'secret',
        GAMEDREAM_MODEL: 'gpt-4o-mini',
      },
      runner: fakeGodot,
      unity,
    });
    expect(withKey.unity).toMatchObject({ version: '6000.6.9f1' });
    expect(withKey.provider).toMatchObject({
      provider: 'openai',
      apiKey: true,
      model: 'gpt-4o-mini',
    });
    expect(JSON.stringify(withKey)).not.toContain('secret');
    expect(withKey.warnings.join(' ')).not.toContain('OPENAI_API_KEY is not set');

    const noKey = await doctorCommand({
      env: { GODOT_BIN: 'godot' },
      runner: fakeGodot,
      unity: null,
    });
    expect(noKey.unity).toBeNull();
    expect(noKey.provider.apiKey).toBe(false);
    expect(noKey.warnings.join(' ')).toContain('Unity 6 not found');
    expect(noKey.warnings.join(' ')).toContain('OPENAI_API_KEY is not set');
    expect(noKey.ok).toBe(true);
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
    expect(report.engine).toBe('present');
    expect(exitCodeFor(report)).toBe(0);
  });

  it('fails G3 when Godot runs but the boot markers are missing', async () => {
    const outDir = join(makeTempDir('gamedream verify markers '), 'my game');
    await composeCommand({
      specPath: join(root, 'fixtures/specs/minimal.yaml'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
    });
    const noMarkers: CommandRunner = {
      async run(command, args) {
        if (args[0] === '--version') {
          return { exitCode: 0, stdout: '4.4.1.stable.official\n', stderr: '' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    };
    const report = await verifyCommand({
      projectDir: outDir,
      env: { GODOT_BIN: 'godot' },
      runner: noMarkers,
    });
    expect(report.gates.G3.status).toBe('fail');
    expect(exitCodeFor(report)).toBe(2);
  });

  it('fails G2 when the detected Godot is older than 4.4', async () => {
    const outDir = join(makeTempDir('gamedream verify old '), 'my game');
    await composeCommand({
      specPath: join(root, 'fixtures/specs/minimal.yaml'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
    });
    const oldGodot: CommandRunner = {
      async run(command, args) {
        if (args[0] === '--version') {
          return { exitCode: 0, stdout: '3.5.3.stable\n', stderr: '' };
        }
        return { exitCode: 0, stdout: 'GAMEDREAM_BOOT_OK\nINVENTORY_COUNT=1\n', stderr: '' };
      },
    };
    const report = await verifyCommand({
      projectDir: outDir,
      env: { GODOT_BIN: 'godot' },
      runner: oldGodot,
    });
    expect(report.gates.G2.status).toBe('fail');
    expect(report.gates.G2.message).toContain('4.4');
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
    expect(report.engine).toBe('missing');
    expect(report.gates.G2.message).toContain('GODOT_BIN');
    expect(exitCodeFor(report)).toBe(3);
  });
});

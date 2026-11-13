import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { makeTempDir } from '@gamedream/testing';
import {
  createCommand,
  createExitCode,
  parseCreateMode,
  parseProviderKind,
} from '../src/commands/create.js';
import type { VerifyReport } from '../src/commands/verify.js';
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

function options() {
  return {
    prompt: '做一个俯视角动作 RPG，有背包和 1 个敌人',
    outDir: join(makeTempDir('gamedream create cli '), 'my game'),
    modulesDir: join(root, 'modules'),
    templatesDir: join(root, 'templates'),
    providerKind: 'fake' as const,
    mode: 'auto' as const,
    env: { GODOT_BIN: 'godot' },
    runner: fakeGodot,
  };
}

describe('createCommand', () => {
  it('creates a project and verifies it', async () => {
    const opts = options();
    const { result, verify } = await createCommand(opts);
    expect(result.templateId).toBe('fixture-minimal');
    expect(existsSync(join(opts.outDir, 'gamedream.yaml'))).toBe(true);
    expect(readFileSync(join(opts.outDir, 'gamedream.yaml'), 'utf8')).toContain(
      'template: fixture-minimal',
    );
    expect(verify?.gates.G3.status).toBe('pass');
  });

  it('does not write in dry-run mode', async () => {
    const opts = { ...options(), mode: 'dry-run' as const };
    const { result, verify } = await createCommand(opts);
    expect(result.plannedModules).toContain('core.events');
    expect(result.plannedFiles).toContain('project.godot');
    expect(verify).toBeUndefined();
    expect(existsSync(join(opts.outDir, 'gamedream.yaml'))).toBe(false);
  });

  it('notices when auto falls back to the fake provider', async () => {
    const opts = {
      ...options(),
      providerKind: 'auto' as const,
      env: { GODOT_BIN: 'godot' },
    };
    const { notice } = await createCommand(opts);
    expect(notice).toContain('OPENAI_API_KEY');
  });

  it('propagates provider transport failures', async () => {
    const opts = {
      ...options(),
      providerKind: 'openai' as const,
      env: { OPENAI_API_KEY: 'secret-key-value', GAMEDREAM_MODEL: 'm' },
      fetchImpl: (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
    };
    try {
      await createCommand(opts);
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toMatchObject({ code: 'PROVIDER_HTTP_ERROR' });
      expect((error as Error).message).not.toContain('secret-key-value');
    }
  });
});

describe('create option helpers', () => {
  it('maps verify results to exit codes in every output mode', () => {
    const missing: VerifyReport = {
      engine: 'missing',
      gates: {
        G1: { status: 'pass' },
        G2: { status: 'skip' },
        G3: { status: 'skip' },
      },
    };
    const failed: VerifyReport = {
      engine: 'present',
      gates: {
        G1: { status: 'pass' },
        G2: { status: 'fail' },
        G3: { status: 'skip' },
      },
    };
    expect(createExitCode(undefined)).toBe(0);
    expect(createExitCode(missing)).toBe(3);
    expect(createExitCode(failed)).toBe(2);
  });

  it('rejects unknown mode/provider values', () => {
    expect(() => parseCreateMode('nonsense')).toThrow();
    expect(() => parseProviderKind('OpenAI')).toThrow();
  });
});

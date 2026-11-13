import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { makeTempDir } from '@gamedream/testing';
import { createCommand } from '../src/commands/create.js';
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
    expect(verify).toBeUndefined();
    expect(existsSync(join(opts.outDir, 'gamedream.yaml'))).toBe(false);
  });
});

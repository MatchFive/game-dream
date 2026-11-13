import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { createCommand } from '../src/commands/create.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe.runIf(Boolean(process.env.GODOT_BIN))('create end-to-end', () => {
  it('creates and verifies a project from a prompt with fake provider', async () => {
    const outDir = join(makeTempDir('gamedream create e2e '), 'my game');
    const { verify } = await createCommand({
      prompt: '做一个俯视角动作 RPG，有背包和 2 个敌人',
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
      providerKind: 'fake',
      mode: 'auto',
    });
    expect(verify?.gates.G1.status).toBe('pass');
    expect(verify?.gates.G2.status).toBe('pass');
    expect(verify?.gates.G3.status).toBe('pass');
  }, 120_000);
});

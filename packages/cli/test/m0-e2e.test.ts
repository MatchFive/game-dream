import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { composeCommand } from '../src/commands/compose.js';
import { verifyCommand } from '../src/commands/verify.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe.runIf(Boolean(process.env.GODOT_BIN))('m0 end-to-end', () => {
  it('plays the m0 arena without skills or save', async () => {
    const outDir = join(makeTempDir('gamedream m0 e2e '), 'm0 game');
    await composeCommand({
      specPath: join(root, 'fixtures/specs/m0.yaml'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
    });
    const report = await verifyCommand({ projectDir: outDir });
    expect(report.gates.G1.status).toBe('pass');
    expect(report.gates.G2.status).toBe('pass');
    expect(report.gates.G3.status).toBe('pass');
  }, 120_000);
});

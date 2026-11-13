import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { composeCommand } from '../src/commands/compose.js';
import { verifyCommand } from '../src/commands/verify.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe.runIf(Boolean(process.env.GODOT_BIN))('end-to-end', () => {
  it('composes and verifies the fixture project with real Godot', async () => {
    const outDir = join(makeTempDir('gamedream e2e '), 'my game');
    await composeCommand({
      specPath: join(root, 'fixtures/specs/minimal.yaml'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
    });
    const report = await verifyCommand({ projectDir: outDir });
    expect(report.gates.G1).toEqual({ status: 'pass' });
    expect(report.gates.G2).toEqual({ status: 'pass' });
    expect(report.gates.G3).toEqual({ status: 'pass' });
  }, 120_000);
});

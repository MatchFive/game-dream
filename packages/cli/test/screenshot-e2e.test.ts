import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { composeCommand } from '../src/commands/compose.js';
import { verifyCommand } from '../src/commands/verify.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe.runIf(Boolean(process.env.GODOT_BIN))('visual gate end-to-end', () => {
  it('captures a screenshot and passes G6', async () => {
    const outDir = join(makeTempDir('gamedream screenshot e2e '), 'visual game');
    await composeCommand({
      specPath: join(root, 'fixtures/specs/m1.yaml'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
    });

    const report = await verifyCommand({
      projectDir: outDir,
      visual: true,
      env: { GODOT_BIN: process.env.GODOT_BIN },
    });
    expect(report.gates.G3.status).toBe('pass');
    expect(report.gates.G6?.status).toBe('pass');
    expect(
      existsSync(join(outDir, 'game/screenshots/screenshot.png')),
    ).toBe(true);
  }, 180_000);
});

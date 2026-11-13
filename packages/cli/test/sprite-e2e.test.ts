import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import { makeTempDir } from '@gamedream/testing';
import { composeCommand } from '../src/commands/compose.js';
import { verifyCommand } from '../src/commands/verify.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe.runIf(Boolean(process.env.GODOT_BIN))('sprite fallback end-to-end', () => {
  it('fails G3 when sprite configs are missing', async () => {
    const outDir = join(makeTempDir('gamedream sprite e2e '), 'sprite game');
    await composeCommand({
      specPath: join(root, 'fixtures/specs/m1.yaml'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
    });
    for (const name of ['player', 'enemy']) {
      unlinkSync(join(outDir, `game/content/sprites/${name}.json`));
    }

    const report = await verifyCommand({
      projectDir: outDir,
      env: { GODOT_BIN: process.env.GODOT_BIN },
    });
    expect(report.gates.G3.status).toBe('fail');
    expect(report.gates.G3.message).toContain('GAMEDREAM_SPRITE_OK');
  }, 120_000);
});

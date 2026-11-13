import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { makeTempDir } from '@gamedream/testing';
import { composeCommand } from '../src/commands/compose.js';
import { verifyCommand } from '../src/commands/verify.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe.runIf(Boolean(process.env.GODOT_BIN))('map fallback end-to-end', () => {
  it('fails G3 when the map has no rows', async () => {
    const outDir = join(makeTempDir('gamedream map e2e '), 'map game');
    await composeCommand({
      specPath: join(root, 'fixtures/specs/m1.yaml'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
    });
    const mapsDir = join(outDir, 'game/content/maps');
    for (const file of readdirSync(mapsDir).filter((name) => name.endsWith('.json'))) {
      const mapPath = join(mapsDir, file);
      const map = JSON.parse(readFileSync(mapPath, 'utf8'));
      map.rows = [];
      writeFileSync(mapPath, JSON.stringify(map), 'utf8');
    }

    const report = await verifyCommand({
      projectDir: outDir,
      env: { GODOT_BIN: process.env.GODOT_BIN },
    });
    expect(report.gates.G3.status).toBe('fail');
    expect(report.gates.G3.message).toContain('GAMEDREAM_MAP_OK');
  }, 120_000);
});

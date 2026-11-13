import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { makeTempDir } from '@gamedream/testing';
import { composeCommand } from '../src/commands/compose.js';
import { verifyCommand } from '../src/commands/verify.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

async function composeM1(prefix: string) {
  const outDir = join(makeTempDir(prefix), 'sprite game');
  await composeCommand({
    specPath: join(root, 'fixtures/specs/m1.yaml'),
    outDir,
    modulesDir: join(root, 'modules'),
    templatesDir: join(root, 'templates'),
  });
  return outDir;
}

describe.runIf(Boolean(process.env.GODOT_BIN))('sprite fallback end-to-end', () => {
  it('fails G3 when sprite configs are missing', async () => {
    const outDir = await composeM1('gamedream sprite e2e ');
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

  it('fails G3 when a texture is missing or animations are empty', async () => {
    const outDir = await composeM1('gamedream sprite bad e2e ');
    const playerPath = join(outDir, 'game/content/sprites/player.json');
    const player = JSON.parse(readFileSync(playerPath, 'utf8'));
    player.texture = 'res://game/content/sprites/missing.svg';
    writeFileSync(playerPath, JSON.stringify(player), 'utf8');

    const enemyPath = join(outDir, 'game/content/sprites/enemy.json');
    const enemy = JSON.parse(readFileSync(enemyPath, 'utf8'));
    enemy.animations = {};
    writeFileSync(enemyPath, JSON.stringify(enemy), 'utf8');

    const report = await verifyCommand({
      projectDir: outDir,
      env: { GODOT_BIN: process.env.GODOT_BIN },
    });
    expect(report.gates.G3.status).toBe('fail');
    expect(report.gates.G3.message).toContain('GAMEDREAM_SPRITE_OK');
  }, 120_000);
});

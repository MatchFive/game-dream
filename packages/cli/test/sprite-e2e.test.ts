import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
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

function stageGeneratedAtlas(outDir: string): void {
  const directory = join(outDir, 'game/build-assets/animations');
  mkdirSync(directory, { recursive: true });
  const sheet = new PNG({ width: 32, height: 16 });
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      const offset = (y * 32 + x) * 4;
      sheet.data[offset] = x < 16 ? 220 : 40;
      sheet.data[offset + 1] = 100;
      sheet.data[offset + 2] = 220;
      sheet.data[offset + 3] = 255;
    }
  }
  writeFileSync(join(directory, 'walk.png'), PNG.sync.write(sheet));
  writeFileSync(
    join(directory, 'walk.tres'),
    [
      '[gd_resource type="SpriteFrames" load_steps=4 format=3]',
      '',
      '[ext_resource type="Texture2D" path="res://game/build-assets/animations/walk.png" id="1"]',
      '',
      '[sub_resource type="AtlasTexture" id="AtlasTexture_1"]',
      'atlas = ExtResource("1")',
      'region = Rect2(0, 0, 16, 16)',
      '',
      '[sub_resource type="AtlasTexture" id="AtlasTexture_2"]',
      'atlas = ExtResource("1")',
      'region = Rect2(16, 0, 16, 16)',
      '',
      '[resource]',
      'animations = [{"frames": [{"duration": 1.0, "texture": SubResource("AtlasTexture_1")}, {"duration": 1.0, "texture": SubResource("AtlasTexture_2")}], "loop": true, "name": "idle", "speed": 8.0}]',
      '',
    ].join('\n'),
    'utf8',
  );
  const manifestPath = join(outDir, 'game/game.manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.acceptance.markers.push('GAMEDREAM_ANIMATION_OK');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
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

  it('auto-loads a generated SpriteFrames atlas over content sprites', async () => {
    const outDir = await composeM1('gamedream sprite atlas e2e ');
    stageGeneratedAtlas(outDir);

    const report = await verifyCommand({
      projectDir: outDir,
      env: { GODOT_BIN: process.env.GODOT_BIN },
    });
    expect(report.gates.G3.status).toBe('pass');
  }, 120_000);
});

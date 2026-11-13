import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeProject } from '../src/index.js';
import { makeTempDir } from '@gamedream/testing';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('m0 composition', () => {
  it('generates the input map, game scene, markers, and input assertions', async () => {
    const outDir = join(makeTempDir('gamedream m0 '), 'm0 game');
    await composeProject({
      specPath: join(root, 'fixtures/specs/m0.yaml'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
    });

    const project = readFileSync(join(outDir, 'project.godot'), 'utf8');
    const gameIndex = project.indexOf('Game=');
    const inputIndex = project.indexOf('InputMapSetup=');
    const eventIndex = project.indexOf('EventBus=');
    expect(inputIndex).toBeGreaterThan(gameIndex);
    expect(eventIndex).toBeGreaterThan(inputIndex);

    const input = readFileSync(join(outDir, 'game/_generated/input_map.gd'), 'utf8');
    expect(input).toContain('_add("move_left"');
    expect(input).toContain('KEY_A');
    expect(input).toContain('_add("attack"');

    const main = readFileSync(join(outDir, 'game/_generated/main.tscn'), 'utf8');
    expect(main).toContain('system.gameflow/scenes/game.tscn');
    expect(main).toContain('ui.hud/scenes/hud.tscn');

    const mainScript = readFileSync(join(outDir, 'game/_generated/main.gd'), 'utf8');
    expect(mainScript).toContain('missing input action');
    expect(mainScript).toContain('"move_right"');

    const manifest = JSON.parse(
      readFileSync(join(outDir, 'game/game.manifest.json'), 'utf8'),
    );
    expect(manifest.acceptance.markers).toEqual([
      'GAMEDREAM_BOOT_OK',
      'GAMEDREAM_WIN',
    ]);
  });
});

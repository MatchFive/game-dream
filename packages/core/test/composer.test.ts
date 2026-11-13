import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeProject } from '../src/index.js';
import { makeTempDir } from '@gamedream/testing';

const root = fileURLToPath(new URL('../../..', import.meta.url));

function options() {
  const outDir = join(makeTempDir('gamedream compose '), 'my game');
  return {
    specPath: join(root, 'fixtures/specs/minimal.yaml'),
    outDir,
    modulesDir: join(root, 'modules'),
    templatesDir: join(root, 'templates'),
  };
}

describe('composeProject', () => {
  it('copies modules and writes a lockfile', async () => {
    const opts = options();
    const result = await composeProject(opts);
    expect(result.order).toEqual(['core.events', 'core.stats', 'system.inventory', 'ui.hud']);
    expect(existsSync(join(opts.outDir, 'modules/core.events/module.yaml'))).toBe(true);
    const lockfile = JSON.parse(readFileSync(join(opts.outDir, 'modules.lock.json'), 'utf8'));
    expect(lockfile.modules).toHaveLength(4);
    expect(lockfile.modules.every((module: { hash: string }) => module.hash.startsWith('sha256:'))).toBe(true);
  });

  it('preserves user files on a second compose', async () => {
    const opts = options();
    await composeProject(opts);
    const userFile = join(opts.outDir, 'game/content/items/keep.json');
    mkdirSync(join(opts.outDir, 'game/content/items'), { recursive: true });
    writeFileSync(userFile, '{"id":"keep"}\n', 'utf8');
    await composeProject(opts);
    expect(readFileSync(userFile, 'utf8')).toBe('{"id":"keep"}\n');
  });
});

describe('generated Godot project', () => {
  it('writes a project.godot with Game first and modules after', async () => {
    const opts = options();
    await composeProject(opts);
    const project = readFileSync(join(opts.outDir, 'project.godot'), 'utf8');
    const gameIndex = project.indexOf('Game="*res://game/_generated/game.gd"');
    const eventIndex = project.indexOf('EventBus="*res://modules/core.events/src/event_bus.gd"');
    const inventoryIndex = project.indexOf(
      'InventoryService="*res://modules/system.inventory/src/inventory_service.gd"',
    );
    expect(gameIndex).toBeGreaterThanOrEqual(0);
    expect(eventIndex).toBeGreaterThan(gameIndex);
    expect(inventoryIndex).toBeGreaterThan(eventIndex);
    expect(project).toContain('run/main_scene="res://game/_generated/main.tscn"');
  });

  it('writes a main scene that mounts the HUD', async () => {
    const opts = options();
    await composeProject(opts);
    const main = readFileSync(join(opts.outDir, 'game/_generated/main.tscn'), 'utf8');
    expect(main).toContain('res://modules/ui.hud/scenes/hud.tscn');
    expect(main).toContain('res://game/_generated/main.gd');
  });

  it('writes a game manifest that separates managed and user files', async () => {
    const opts = options();
    await composeProject(opts);
    const manifest = JSON.parse(
      readFileSync(join(opts.outDir, 'game/game.manifest.json'), 'utf8'),
    );
    expect(manifest.managed).toContain('game/_generated/**');
    expect(manifest.user).toContain('game/content/**');
    expect(manifest.hashes['game/_generated/main.tscn']).toMatch(/^sha256:/);
  });
});

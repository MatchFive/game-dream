import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  composeProject,
  hashDirectory,
  parseModuleManifest,
} from '../src/index.js';
import { copyModules } from '../src/composer/copy-modules.js';
import { makeTempDir, writeFile } from '@gamedream/testing';

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

  it('preserves staged Studio build assets on recompose', async () => {
    const opts = options();
    await composeProject(opts);
    const asset = join(opts.outDir, 'game/build-assets/studio/hero.png');
    mkdirSync(join(opts.outDir, 'game/build-assets/studio'), { recursive: true });
    writeFileSync(asset, 'staged', 'utf8');
    await composeProject(opts);
    expect(readFileSync(asset, 'utf8')).toBe('staged');
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

  it('preserves user edits to project.godot on recompose', async () => {
    const opts = options();
    await composeProject(opts);
    const projectPath = join(opts.outDir, 'project.godot');
    const first = readFileSync(projectPath, 'utf8');
    const edited =
      first.replace(
        'window/size/viewport_width=1280',
        'window/size/viewport_width=1920',
      ) + '\n[input]\nuser_action={ "deadzone": 0.5 }\n';
    writeFileSync(projectPath, edited, 'utf8');

    await composeProject(opts);

    const second = readFileSync(projectPath, 'utf8');
    expect(second).toContain('window/size/viewport_width=1920');
    expect(second).toContain('[input]');
    expect(second).toContain('user_action');
    expect(existsSync(`${projectPath}.bak`)).toBe(true);
  });

  it('hashes the copied module tree in the lockfile', async () => {
    const opts = options();
    await composeProject(opts);
    const lockfile = JSON.parse(readFileSync(join(opts.outDir, 'modules.lock.json'), 'utf8'));
    const entry = lockfile.modules.find((module: { id: string }) => module.id === 'core.events');
    expect(entry.hash).toBe(hashDirectory(join(opts.outDir, 'modules/core.events')));
  });

  it('writes UTF-8/LF files into a non-ASCII project directory', async () => {
    const opts = {
      ...options(),
      outDir: join(makeTempDir('gamedream compose '), '我的 游戏 Ünïcode'),
    };
    await composeProject(opts);
    for (const relative of [
      'project.godot',
      'game/_generated/main.gd',
      'game/_generated/main.tscn',
      'game/game.manifest.json',
      'modules.lock.json',
    ]) {
      const bytes = readFileSync(join(opts.outDir, relative));
      expect(bytes.includes(0x0d)).toBe(false);
      expect(bytes[0]).not.toBe(0xef);
    }
  });
});

describe('copyModules', () => {
  it('refreshes an existing module directory from the source', () => {
    const sourceRoot = makeTempDir('gamedream module source ');
    const source = join(sourceRoot, 'core.events');
    writeFile(source, 'module.yaml', 'id: core.events\n');
    writeFile(source, 'src/file.txt', 'v1');

    const manifest = parseModuleManifest({
      id: 'core.events',
      version: '1.0.0',
      engine: 'godot',
      engine_version: '>=4.4 <5',
      kind: 'core',
    });
    const record = { manifest, dir: source };
    const outDir = makeTempDir('gamedream module out ');

    copyModules(outDir, [record]);
    expect(readFileSync(join(outDir, 'modules/core.events/src/file.txt'), 'utf8')).toBe('v1');

    writeFile(source, 'src/file.txt', 'v2');
    copyModules(outDir, [record]);
    expect(readFileSync(join(outDir, 'modules/core.events/src/file.txt'), 'utf8')).toBe('v2');
  });
});

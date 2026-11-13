import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalRegistry } from '../src/registry/local-registry.js';
import { resolveModules } from '../src/resolver/resolve-modules.js';
import { ResolutionError } from '../src/errors.js';
import { writeModule } from '@gamedream/testing';
import type { GameSpec, TemplateManifest } from '../src/index.js';

const spec: GameSpec = {
  version: 1,
  project: {
    name: 'fixture-minimal',
    engine: 'godot',
    godot_version: '4.4',
    dimension: '2d',
    view: 'top-down',
    target: ['windows'],
  },
  genre: { primary: 'action-rpg', secondary: [], template: 'fixture-minimal' },
  scope: { levels: 1, enemies: 1, bosses: 0, skills: 0, items: 1, quests: 0 },
  systems: { inventory: true },
  content: { language: 'zh-CN' },
  acceptance: [],
};

const template: TemplateManifest = {
  id: 'fixture-minimal',
  genre: 'action-rpg',
  dimension: '2d',
  view: 'top-down',
  modules: {
    required: ['core.events', 'core.stats', 'system.inventory', 'ui.hud'],
    optional: [],
  },
  minimum_complete: {},
  acceptance: [],
};

function makeRegistry(modules: Record<string, unknown>): LocalRegistry {
  const root = mkdtempSync(join(tmpdir(), 'gamedream-resolver-'));
  for (const [id, manifest] of Object.entries(modules)) {
    writeModule(root, id, manifest as Record<string, unknown>);
  }
  return new LocalRegistry(root);
}

const baseModules = {
  'core.events': {
    id: 'core.events',
    version: '1.0.0',
    engine: 'godot',
    engine_version: '>=4.4 <5',
    kind: 'core',
    depends: {},
    provides: { services: ['events'] },
    autoloads: [{ name: 'EventBus', path: 'src/event_bus.gd', order: 10 }],
  },
  'core.stats': {
    id: 'core.stats',
    version: '1.0.0',
    engine: 'godot',
    engine_version: '>=4.4 <5',
    kind: 'core',
    depends: { 'core.events': '^1.0.0' },
    provides: { services: ['stats'] },
    autoloads: [{ name: 'StatsService', path: 'src/stats_service.gd', order: 20 }],
  },
  'system.inventory': {
    id: 'system.inventory',
    version: '1.0.0',
    engine: 'godot',
    engine_version: '>=4.4 <5',
    kind: 'system',
    depends: { 'core.events': '^1.0.0', 'core.stats': '^1.0.0' },
    provides: { services: ['inventory'] },
    autoloads: [{ name: 'InventoryService', path: 'src/inventory_service.gd', order: 30 }],
  },
  'ui.hud': {
    id: 'ui.hud',
    version: '1.0.0',
    engine: 'godot',
    engine_version: '>=4.4 <5',
    kind: 'ui',
    depends: { 'core.events': '^1.0.0', 'system.inventory': '^1.0.0' },
    provides: { services: [] },
    ui_mounts: [{ slot: 'hud', scene: 'scenes/hud.tscn', layer: 10 }],
  },
};

describe('resolveModules', () => {
  it('resolves dependencies in topological order', () => {
    const registry = makeRegistry(baseModules);
    const result = resolveModules({ spec, template, registry, engine: 'godot' });
    expect(result.order).toEqual(['core.events', 'core.stats', 'system.inventory', 'ui.hud']);
    expect(result.modules).toHaveLength(4);
  });

  it('rejects a missing module', () => {
    const registry = makeRegistry(baseModules);
    const broken = {
      ...template,
      modules: { required: ['core.events', 'core.missing'], optional: [] },
    };
    expect(() =>
      resolveModules({ spec, template: broken, registry, engine: 'godot' }),
    ).toThrowError(ResolutionError);
    try {
      resolveModules({ spec, template: broken, registry, engine: 'godot' });
    } catch (error) {
      expect((error as ResolutionError).code).toBe('MISSING_MODULE');
    }
  });

  it('rejects a missing dependency', () => {
    const registry = makeRegistry({
      ...baseModules,
      'system.inventory': {
        ...baseModules['system.inventory'],
        depends: { 'core.missing': '^1.0.0' },
      },
    });
    try {
      resolveModules({ spec, template, registry, engine: 'godot' });
      throw new Error('expected failure');
    } catch (error) {
      expect((error as ResolutionError).code).toBe('MISSING_DEPENDENCY');
    }
  });

  it('rejects a dependency cycle', () => {
    const registry = makeRegistry({
      'core.a': {
        id: 'core.a',
        version: '1.0.0',
        engine: 'godot',
        engine_version: '>=4.4 <5',
        kind: 'core',
        depends: { 'core.b': '^1.0.0' },
      },
      'core.b': {
        id: 'core.b',
        version: '1.0.0',
        engine: 'godot',
        engine_version: '>=4.4 <5',
        kind: 'core',
        depends: { 'core.a': '^1.0.0' },
      },
    });
    const cyclic = { ...template, modules: { required: ['core.a'], optional: [] } };
    try {
      resolveModules({ spec, template: cyclic, registry, engine: 'godot' });
      throw new Error('expected failure');
    } catch (error) {
      expect((error as ResolutionError).code).toBe('CYCLE');
    }
  });

  it('rejects an engine mismatch', () => {
    const registry = makeRegistry({
      ...baseModules,
      'core.events': { ...baseModules['core.events'], engine: 'unity' },
    });
    try {
      resolveModules({ spec, template, registry, engine: 'godot' });
      throw new Error('expected failure');
    } catch (error) {
      expect((error as ResolutionError).code).toBe('ENGINE_MISMATCH');
    }
  });

  it('rejects a module whose engine_version excludes the target Godot version', () => {
    const registry = makeRegistry({
      ...baseModules,
      'core.events': { ...baseModules['core.events'], engine_version: '>=4.5 <5' },
    });
    try {
      resolveModules({
        spec,
        template,
        registry,
        engine: 'godot',
        engineVersion: '4.4',
      });
      throw new Error('expected failure');
    } catch (error) {
      expect((error as ResolutionError).code).toBe('ENGINE_VERSION_MISMATCH');
    }
  });

  it('includes optional modules enabled by spec.systems', () => {
    const registry = makeRegistry(baseModules);
    const optionalTemplate: TemplateManifest = {
      ...template,
      modules: { required: ['core.events'], optional: ['core.stats'] },
    };
    const enabled = resolveModules({
      spec: { ...spec, systems: { stats: true } },
      template: optionalTemplate,
      registry,
      engine: 'godot',
    });
    expect(enabled.order).toContain('core.stats');

    const disabled = resolveModules({
      spec: { ...spec, systems: { stats: false } },
      template: optionalTemplate,
      registry,
      engine: 'godot',
    });
    expect(disabled.order).not.toContain('core.stats');
  });

  it('rejects conflicting modules', () => {
    const registry = makeRegistry({
      ...baseModules,
      'core.events': { ...baseModules['core.events'], conflicts: ['core.stats'] },
    });
    try {
      resolveModules({ spec, template, registry, engine: 'godot' });
      throw new Error('expected failure');
    } catch (error) {
      expect((error as ResolutionError).code).toBe('CONFLICT');
    }
  });

  it('rejects a dependency version mismatch', () => {
    const registry = makeRegistry({
      ...baseModules,
      'core.stats': {
        ...baseModules['core.stats'],
        depends: { 'core.events': '^2.0.0' },
      },
    });
    try {
      resolveModules({ spec, template, registry, engine: 'godot' });
      throw new Error('expected failure');
    } catch (error) {
      expect((error as ResolutionError).code).toBe('VERSION_MISMATCH');
    }
  });
});

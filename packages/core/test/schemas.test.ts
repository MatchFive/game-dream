import { describe, expect, it } from 'vitest';
import { parseGameSpec } from '../src/schemas/game-spec.js';
import { parseGameManifest, parseLockfile, parseModuleManifest, parseTemplate } from '../src/schemas/index.js';

const valid = {
  version: 1,
  project: {
    name: 'fixture-minimal',
    engine: 'godot',
    godot_version: '4.4',
    dimension: '2d',
    view: 'top-down',
    target: ['windows'],
  },
  genre: { primary: 'action-rpg', template: 'fixture-minimal' },
  scope: { levels: 1, enemies: 1 },
  systems: { inventory: true },
  content: { language: 'zh-CN' },
};

describe('GameSpec schema', () => {
  it('parses a valid spec', () => {
    const spec = parseGameSpec(valid);
    expect(spec.project.engine).toBe('godot');
    expect(spec.genre.template).toBe('fixture-minimal');
    expect(spec.project.target).toEqual(['windows']);
  });

  it('rejects an unknown engine', () => {
    expect(() =>
      parseGameSpec({ ...valid, project: { ...valid.project, engine: 'cryengine' } }),
    ).toThrow();
  });

  it('rejects a missing template', () => {
    expect(() => parseGameSpec({ ...valid, genre: { primary: 'action-rpg' } })).toThrow();
  });
});

const manifest = {
  id: 'core.events',
  version: '1.0.0',
  engine: 'godot',
  engine_version: '>=4.4 <5',
  kind: 'core',
  genres: ['any'],
  depends: {},
  provides: { services: ['events'] },
  autoloads: [{ name: 'EventBus', path: 'src/event_bus.gd', order: 10 }],
  scenarios: ['scenarios/emit.yaml'],
  tests: ['tests/test_event_bus.gd'],
  ai_skill: 'skills/events.md',
  license: 'Apache-2.0',
};

describe('ModuleManifest schema', () => {
  it('parses a valid manifest', () => {
    expect(parseModuleManifest(manifest).id).toBe('core.events');
  });

  it('rejects a non-semver version', () => {
    expect(() => parseModuleManifest({ ...manifest, version: 'one' })).toThrow();
  });

  it('rejects an autoload without a path', () => {
    expect(() =>
      parseModuleManifest({ ...manifest, autoloads: [{ name: 'EventBus' }] }),
    ).toThrow();
  });
});

describe('TemplateManifest schema', () => {
  it('parses a valid template', () => {
    const template = parseTemplate({
      id: 'fixture-minimal',
      genre: 'action-rpg',
      dimension: '2d',
      view: 'top-down',
      modules: { required: ['core.events'], optional: [] },
      minimum_complete: { levels: 1, enemies: 0 },
      acceptance: ['项目可启动'],
    });
    expect(template.modules.required).toEqual(['core.events']);
  });

  it('rejects an empty module list', () => {
    expect(() =>
      parseTemplate({
        id: 'fixture-minimal',
        genre: 'action-rpg',
        dimension: '2d',
        view: 'top-down',
        modules: { required: [] },
      }),
    ).toThrow();
  });
});

describe('Lockfile schema', () => {
  it('parses a valid lockfile', () => {
    const lockfile = parseLockfile({
      version: 1,
      modules: [
        { id: 'core.events', version: '1.0.0', source: 'local', hash: 'sha256:abc' },
      ],
    });
    expect(lockfile.modules[0].id).toBe('core.events');
  });

  it('rejects a module without a hash', () => {
    expect(() =>
      parseLockfile({
        version: 1,
        modules: [{ id: 'core.events', version: '1.0.0', source: 'local' }],
      }),
    ).toThrow();
  });
});

describe('GameManifest schema', () => {
  it('parses managed and user globs', () => {
    const manifest = parseGameManifest({
      version: 1,
      managed: ['game/_generated/**'],
      user: ['game/content/**'],
      hashes: { 'game/_generated/main.tscn': 'sha256:abc' },
    });
    expect(manifest.user).toEqual(['game/content/**']);
  });

  it('rejects an empty managed list', () => {
    expect(() =>
      parseGameManifest({ version: 1, managed: [], user: [], hashes: {} }),
    ).toThrow();
  });
});

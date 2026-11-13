import { describe, expect, it } from 'vitest';
import { parseGameSpec } from '../src/schemas/game-spec.js';

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

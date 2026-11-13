import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { parseGameSpec, parseModuleManifest, parseTemplate } from '../src/index.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const modulesDir = join(root, 'modules');
const templatePath = join(root, 'templates/fixture-minimal/template.yaml');
const specPath = join(root, 'fixtures/specs/minimal.yaml');

const sourceFiles: Record<string, string> = {
  'core.events': 'event_bus.gd',
  'core.stats': 'stats_service.gd',
  'system.ai': 'enemy.gd',
  'system.combat': 'health_component.gd',
  'system.gameflow': 'gameflow.gd',
  'system.inventory': 'inventory_service.gd',
  'system.player': 'player.gd',
  'ui.hud': 'hud.gd',
};

describe('fixture content', () => {
  it('loads valid modules', () => {
    const ids = readdirSync(modulesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(ids).toEqual([
      'core.events',
      'core.stats',
      'system.ai',
      'system.combat',
      'system.gameflow',
      'system.inventory',
      'system.player',
      'ui.hud',
    ]);
    for (const id of ids) {
      const manifest = parseModuleManifest(
        parse(readFileSync(join(modulesDir, id, 'module.yaml'), 'utf8')),
      );
      expect(manifest.id).toBe(id);
      expect(existsSync(join(modulesDir, id, 'api.md'))).toBe(true);
      expect(existsSync(join(modulesDir, id, 'skills'))).toBe(true);
      expect(existsSync(join(modulesDir, id, 'scenarios'))).toBe(true);
    }
  });

  it('loads the fixture template and spec', () => {
    const template = parseTemplate(parse(readFileSync(templatePath, 'utf8')));
    expect(template.id).toBe('fixture-minimal');
    const spec = parseGameSpec(parse(readFileSync(specPath, 'utf8')));
    expect(spec.genre.template).toBe('fixture-minimal');
  });

  it('exposes the runtime contract in GDScript', () => {
    const expected: Record<string, string[]> = {
      'core.events': ['register_event_bus', 'emit_event'],
      'core.stats': ['register_service', 'set_stat', 'get_stat'],
      'system.ai': ['move_and_slide', 'attack_damage', 'enemies'],
      'system.combat': ['take_damage', 'health_changed', 'died'],
      'system.gameflow': ['GAMEDREAM_WIN', 'GAMEDREAM_LOSE', '_autoplay'],
      'system.inventory': ['register_service', 'add_item', 'remove_item', 'total_count'],
      'system.player': ['Input.get_vector', 'is_action_pressed', 'player.health_changed'],
      'ui.hud': ['service_registered', 'total_count', 'hp_label'],
    };
    for (const [id, tokens] of Object.entries(expected)) {
      const source = readFileSync(join(modulesDir, id, 'src', sourceFiles[id]), 'utf8');
      for (const token of tokens) expect(source).toContain(token);
    }
  });
});

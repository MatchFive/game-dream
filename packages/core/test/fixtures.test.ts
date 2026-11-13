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
  'core.content': 'content_db.gd',
  'core.events': 'event_bus.gd',
  'core.save': 'save_service.gd',
  'core.stats': 'stats_service.gd',
  'system.ai': 'enemy.gd',
  'system.combat': 'health_component.gd',
  'system.equipment': 'equipment_service.gd',
  'system.gameflow': 'gameflow.gd',
  'system.inventory': 'inventory_service.gd',
  'system.loot': 'loot_service.gd',
  'system.player': 'player.gd',
  'system.progression': 'progression_service.gd',
  'system.skills': 'skill_service.gd',
  'ui.equipment_screen': 'equipment_screen.gd',
  'ui.hud': 'hud.gd',
  'ui.inventory_screen': 'inventory_screen.gd',
  'ui.main_menu': 'main_menu.gd',
  'ui.pause_menu': 'pause_menu.gd',
  'ui.skill_screen': 'skill_screen.gd',
};

describe('fixture content', () => {
  it('loads valid modules', () => {
    const ids = readdirSync(modulesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(ids).toEqual([
      'core.content',
      'core.events',
      'core.save',
      'core.stats',
      'system.ai',
      'system.combat',
      'system.equipment',
      'system.gameflow',
      'system.inventory',
      'system.loot',
      'system.player',
      'system.progression',
      'system.skills',
      'ui.equipment_screen',
      'ui.hud',
      'ui.inventory_screen',
      'ui.main_menu',
      'ui.pause_menu',
      'ui.skill_screen',
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
      'core.content': ['get_item', 'get_skill', 'get_loot_table'],
      'core.events': ['register_event_bus', 'emit_event'],
      'core.save': ['save_game', 'load_game', 'serialize'],
      'core.stats': ['register_service', 'set_stat', 'get_stat'],
      'system.ai': ['move_and_slide', 'attack_damage', 'enemies', 'enemy.died'],
      'system.combat': ['take_damage', 'set_max_hp', 'health_changed', 'died'],
      'system.equipment': ['equip', 'get_bonus', 'loot.dropped'],
      'system.gameflow': [
        'GAMEDREAM_WIN',
        'GAMEDREAM_LOSE',
        'GAMEDREAM_LEVEL_UP',
        'GAMEDREAM_EQUIPPED',
        'GAMEDREAM_SKILL_CAST',
        '_autoplay',
      ],
      'system.inventory': ['register_service', 'add_item', 'remove_item', 'total_count'],
      'system.loot': ['enemy.died', 'loot.dropped', 'get_loot_table'],
      'system.player': [
        'Input.get_vector',
        'is_action_pressed',
        'skill_1',
        'player.health_changed',
      ],
      'system.progression': ['add_xp', 'leveled_up', 'enemy.died'],
      'system.skills': ['cast', 'cooldown', 'skill.cast'],
      'ui.equipment_screen': ['toggle_equipment', 'get_bonus', 'get_equipped'],
      'ui.hud': [
        'service_registered',
        'total_count',
        'hp_label',
        'level_label',
        'get_first_node_in_group',
      ],
      'ui.inventory_screen': ['toggle_inventory', 'items()', 'Equip'],
      'ui.main_menu': ['NewGame', 'load_game', 'paused'],
      'ui.pause_menu': ['pause', 'save_game', 'paused'],
      'ui.skill_screen': ['toggle_skills', 'get_skill', 'cooldown'],
    };
    for (const [id, tokens] of Object.entries(expected)) {
      const source = readFileSync(join(modulesDir, id, 'src', sourceFiles[id]), 'utf8');
      for (const token of tokens) expect(source).toContain(token);
    }
  });
});

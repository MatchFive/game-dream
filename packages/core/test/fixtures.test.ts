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
  'system.dialogue': 'dialogue_service.gd',
  'system.equipment': 'equipment_service.gd',
  'system.gameflow': 'gameflow.gd',
  'system.inventory': 'inventory_service.gd',
  'system.levels': 'level_service.gd',
  'system.loot': 'loot_service.gd',
  'system.map': 'map_service.gd',
  'system.player': 'player.gd',
  'system.progression': 'progression_service.gd',
  'system.quests': 'quest_service.gd',
  'system.skills': 'skill_service.gd',
  'system.sprites': 'sprite_service.gd',
  'ui.dialogue_box': 'dialogue_box.gd',
  'ui.equipment_screen': 'equipment_screen.gd',
  'ui.hud': 'hud.gd',
  'ui.inventory_screen': 'inventory_screen.gd',
  'ui.level_transition': 'level_transition.gd',
  'ui.main_menu': 'main_menu.gd',
  'ui.pause_menu': 'pause_menu.gd',
  'ui.quest_tracker': 'quest_tracker.gd',
  'ui.result_screen': 'result_screen.gd',
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
      'system.dialogue',
      'system.equipment',
      'system.gameflow',
      'system.inventory',
      'system.levels',
      'system.loot',
      'system.map',
      'system.player',
      'system.progression',
      'system.quests',
      'system.skills',
      'system.sprites',
      'ui.dialogue_box',
      'ui.equipment_screen',
      'ui.hud',
      'ui.inventory_screen',
      'ui.level_transition',
      'ui.main_menu',
      'ui.pause_menu',
      'ui.quest_tracker',
      'ui.result_screen',
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
      'core.content': ['get_item', 'get_skill', 'get_loot_table', 'get_level', 'get_map', 'get_sprite'],
      'core.events': ['register_event_bus', 'emit_event'],
      'core.save': ['save_game', 'load_game', 'serialize', 'clear'],
      'core.stats': ['register_service', 'set_stat', 'get_stat'],
      'system.ai': ['move_and_slide', 'attack_damage', 'enemies', 'enemy.died', 'AnimatedSprite2D', 'sprites.apply'],
      'system.combat': ['take_damage', 'set_max_hp', 'heal_full', 'health_changed', 'died'],
      'system.equipment': ['equip', 'get_bonus', 'loot.dropped', 'reset'],
      'system.gameflow': [
        'GAMEDREAM_WIN',
        'GAMEDREAM_LOSE',
        'GAMEDREAM_LEVEL_UP',
        'GAMEDREAM_EQUIPPED',
        'GAMEDREAM_SKILL_CAST',
        'GAMEDREAM_LEVEL_2',
        'GAMEDREAM_BOSS',
        'GAMEDREAM_VICTORY',
        'GAMEDREAM_MAP_OK',
        'EnemyRoot',
        'MapRoot',
        'level.started',
        'new_game',
        'game.restart',
        '_reset_run',
        '_steer',
        '_autoplay',
      ],
      'system.inventory': ['register_service', 'add_item', 'remove_item', 'total_count', 'reset'],
      'system.levels': ['level.started', 'has_next', 'advance', 'current_map', 'reset', 'serialize'],
      'system.loot': ['enemy.died', 'loot.dropped', 'get_loot_table', 'reset'],
      'system.map': ['TileMapLayer', 'set_cell', 'StaticBody2D', 'build', 'is_wall', 'first_floor'],
      'system.player': [
        'Input.get_vector',
        'is_action_pressed',
        'skill_1',
        'player.health_changed',
        'AnimatedSprite2D',
        'sprites.apply',
      ],
      'system.dialogue': ['dialogue.line', 'dialogue.finished', 'advance', 'get_current_line'],
      'system.progression': ['add_xp', 'leveled_up', 'enemy.died', 'reset'],
      'system.quests': ['enemy.died', 'quest.completed', 'completed_count', 'serialize', 'reset'],
      'system.skills': ['cast', 'cooldown', 'skill.cast', 'reset'],
      'system.sprites': ['AnimatedSprite2D', 'SpriteFrames', 'AtlasTexture', 'apply', 'has_applied'],
      'ui.dialogue_box': ['dialogue.line', 'advance'],
      'ui.equipment_screen': ['toggle_equipment', 'get_bonus', 'get_equipped'],
      'ui.hud': [
        'service_registered',
        'total_count',
        'hp_label',
        'level_label',
        'get_first_node_in_group',
      ],
      'ui.inventory_screen': ['toggle_inventory', 'items()', 'Equip'],
      'ui.level_transition': ['level.transition', 'create_tween'],
      'ui.main_menu': ['NewGame', 'load_game', 'paused', 'game.started'],
      'ui.pause_menu': ['pause', 'save_game', 'paused'],
      'ui.quest_tracker': ['begins_with("quest.")', 'get_active'],
      'ui.result_screen': ['game.won', 'game.lost', 'game.restart', 'PROCESS_MODE_ALWAYS'],
      'ui.skill_screen': ['toggle_skills', 'get_skill', 'cooldown'],
    };
    for (const [id, tokens] of Object.entries(expected)) {
      const source = readFileSync(join(modulesDir, id, 'src', sourceFiles[id]), 'utf8');
      for (const token of tokens) expect(source).toContain(token);
    }
  });
});

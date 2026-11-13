import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeProject } from '../src/index.js';
import { makeTempDir } from '@gamedream/testing';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('m1 composition', () => {
  it('copies template content without overwriting user edits', async () => {
    const outDir = join(makeTempDir('gamedream m1 '), 'm1 game');
    const options = {
      specPath: join(root, 'fixtures/specs/m1.yaml'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
    };
    await composeProject(options);

    const itemPath = join(outDir, 'game/content/items/rusty_sword.json');
    expect(existsSync(itemPath)).toBe(true);
    writeFileSync(
      itemPath,
      readFileSync(itemPath, 'utf8').replace('Rusty Sword', 'My Sword'),
      'utf8',
    );
    await composeProject(options);
    expect(readFileSync(itemPath, 'utf8')).toContain('My Sword');

    const project = readFileSync(join(outDir, 'project.godot'), 'utf8');
    const contentIndex = project.indexOf('ContentDB=');
    const progressionIndex = project.indexOf('ProgressionService=');
    expect(contentIndex).toBeGreaterThan(project.indexOf('Game='));
    expect(progressionIndex).toBeGreaterThan(contentIndex);
    expect(project).toContain('SaveService=');
    expect(project).toContain('MapService=');
    expect(project).toContain('SpriteService=');
    expect(project).toContain('SettingsService=');
    expect(project).toContain('AudioService=');
    expect(project).toContain('ScreenshotCapture=');
    const capture = readFileSync(
      join(outDir, 'game/_generated/screenshot.gd'),
      'utf8',
    );
    expect(capture).toContain('OS.get_cmdline_user_args');
    expect(capture).toContain('--screenshot');
    expect(capture).toContain('RenderingServer.frame_post_draw');

    const main = readFileSync(join(outDir, 'game/_generated/main.tscn'), 'utf8');
    expect(main).toContain('system.gameflow/scenes/game.tscn');
    expect(main).toContain('ui.hud/scenes/hud.tscn');
    expect(main).toContain('ui.quest_tracker/scenes/quest_tracker.tscn');
    expect(main).toContain('ui.dialogue_box/scenes/dialogue_box.tscn');
    expect(main).toContain('ui.level_transition/scenes/level_transition.tscn');
    expect(main).toContain('ui.settings/scenes/settings.tscn');
    expect(main).toContain('ui.result_screen/scenes/result_screen.tscn');
    expect(main).toContain('ui.inventory_screen/scenes/inventory_screen.tscn');
    expect(main).toContain('ui.equipment_screen/scenes/equipment_screen.tscn');
    expect(main).toContain('ui.skill_screen/scenes/skill_screen.tscn');
    expect(main).toContain('ui.pause_menu/scenes/pause_menu.tscn');
    expect(main).toContain('ui.main_menu/scenes/main_menu.tscn');

    const input = readFileSync(join(outDir, 'game/_generated/input_map.gd'), 'utf8');
    expect(input).toContain('_add("toggle_inventory"');
    expect(input).toContain('_add("toggle_equipment"');
    expect(input).toContain('_add("toggle_skills"');
    expect(input).toContain('_add("pause"');

    const saveSections = JSON.parse(
      readFileSync(join(outDir, 'game/_generated/save_sections.json'), 'utf8'),
    );
    expect(saveSections.sections).toEqual(
      expect.arrayContaining(['inventory', 'progression', 'equipment', 'quests', 'levels']),
    );

    const manifest = JSON.parse(
      readFileSync(join(outDir, 'game/game.manifest.json'), 'utf8'),
    );
    expect(manifest.acceptance.markers).toEqual([
      'GAMEDREAM_BOOT_OK',
      'GAMEDREAM_MAP_OK',
      'GAMEDREAM_SPRITE_OK',
      'GAMEDREAM_AUDIO_OK',
      'GAMEDREAM_DIALOGUE',
      'GAMEDREAM_LEVEL_UP',
      'GAMEDREAM_EQUIPPED',
      'GAMEDREAM_SKILL_CAST',
      'GAMEDREAM_LEVEL_2',
      'GAMEDREAM_BOSS',
      'GAMEDREAM_QUEST_COMPLETE',
      'GAMEDREAM_VICTORY',
      'GAMEDREAM_WIN',
    ]);
    expect(
      existsSync(join(outDir, 'game/content/quests/kill_slime.json')),
    ).toBe(true);
    expect(
      existsSync(join(outDir, 'game/content/dialogue/intro.json')),
    ).toBe(true);
    expect(
      existsSync(join(outDir, 'game/content/levels/campaign.json')),
    ).toBe(true);
    const clearing = JSON.parse(
      readFileSync(join(outDir, 'game/content/maps/clearing.json'), 'utf8'),
    );
    expect(clearing.rows).toHaveLength(20);
    expect(clearing.rows.every((row: string) => row.length === 40)).toBe(true);
    expect(
      existsSync(join(outDir, 'game/content/sprites/player.json')),
    ).toBe(true);
    expect(
      existsSync(join(outDir, 'game/content/sprites/boss.json')),
    ).toBe(true);
    const campaign = JSON.parse(
      readFileSync(join(outDir, 'game/content/levels/campaign.json'), 'utf8'),
    );
    expect(campaign.levels).toHaveLength(3);
    expect(campaign.levels[2].enemy.kind).toBe('boss');
    expect(
      existsSync(join(outDir, 'game/content/maps/throne.json')),
    ).toBe(true);
    expect(
      existsSync(join(outDir, 'modules/system.player/assets/player.svg')),
    ).toBe(true);
  });
});

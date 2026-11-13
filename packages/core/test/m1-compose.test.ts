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

    const main = readFileSync(join(outDir, 'game/_generated/main.tscn'), 'utf8');
    expect(main).toContain('system.gameflow/scenes/game.tscn');
    expect(main).toContain('ui.hud/scenes/hud.tscn');
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
      expect.arrayContaining(['inventory', 'progression', 'equipment']),
    );

    const manifest = JSON.parse(
      readFileSync(join(outDir, 'game/game.manifest.json'), 'utf8'),
    );
    expect(manifest.acceptance.markers).toEqual([
      'GAMEDREAM_BOOT_OK',
      'GAMEDREAM_LEVEL_UP',
      'GAMEDREAM_EQUIPPED',
      'GAMEDREAM_SKILL_CAST',
      'GAMEDREAM_WIN',
    ]);
  });
});

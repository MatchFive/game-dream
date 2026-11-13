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

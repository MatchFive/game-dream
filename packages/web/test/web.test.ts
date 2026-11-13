import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { composeWebProject, verifyWebProject } from '../src/index.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const templatesDir = join(root, 'templates/web-m0');

describe('web M0', () => {
  it('composes a standalone project and wins headlessly', () => {
    const outDir = join(makeTempDir('gamedream web '), 'web game');
    const result = composeWebProject({ outDir, templatesDir, name: 'arena' });
    expect(result.files.every((file) => existsSync(join(outDir, file)))).toBe(true);
    const config = JSON.parse(readFileSync(join(outDir, 'game.json'), 'utf8'));
    expect(config.name).toBe('arena');
    expect(config.arena.width).toBe(960);

    const verified = verifyWebProject({ projectDir: outDir });
    expect(verified.passed).toBe(true);
    expect(verified.stdout).toContain('WEB_BOOT_OK');
    expect(verified.stdout).toContain('WEB_WIN');

    const relativeDir = relative(process.cwd(), outDir);
    expect(verifyWebProject({ projectDir: relativeDir }).passed).toBe(true);

    const bare = spawnSync(process.execPath, [join(outDir, 'sim-run.mjs')], {
      cwd: outDir,
      encoding: 'utf8',
    });
    expect(bare.status).toBe(0);
    expect(bare.stdout).toContain('WEB_WIN');
  });

  it('embeds M1 content, sprites, levels, and quests', () => {
    const outDir = join(makeTempDir('gamedream web content '), 'web game');
    const result = composeWebProject({
      outDir,
      templatesDir,
      contentDir: join(root, 'templates/rpg-action-m1/content'),
      modulesDir: join(root, 'modules'),
      name: 'm1-web',
    });
    expect(result.config.levels).toHaveLength(3);
    expect(result.config.quests).toHaveLength(2);
    expect(result.config.sprites).toMatchObject({
      player: 'assets/system.player/player.svg',
      enemy: 'assets/system.ai/enemy.svg',
      boss: 'assets/system.ai/enemy.svg',
    });
    expect(existsSync(join(outDir, 'assets/system.player/player.svg'))).toBe(true);
    expect(result.config.levels?.[1].map.tileset.floor).toBe('3b3a5a');
    const html = readFileSync(join(outDir, 'index.html'), 'utf8');
    expect(html).toContain('id="inventory"');
    expect(html).toContain('id="quests"');
    expect(html).toContain('id="quests-line"');
    expect(html).toContain('id="touch-controls"');
    expect(html).toContain('data-hold="attack"');
    expect(html).toContain('data-panel="pause"');
    expect(html).toContain('id="pause"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('id="pause-restart"');
    expect(html).toContain('class="panel hidden"');
    expect(html).toContain('vendor/phaser.min.js');
    expect(existsSync(join(outDir, 'vendor/phaser.min.js'))).toBe(true);
    const game = readFileSync(join(outDir, 'game.js'), 'utf8');
    expect(game).toContain("key === 'i'");
    expect(game).toContain("key === 'q'");
    expect(game).toContain("key === 'o'");
    expect(game).toContain("key === 'r'");
    expect(game).toContain("key === 'escape'");
    expect(game).toContain('new Phaser.Game');
    expect(game).toContain('this.scale.resize');
    expect(game).toContain('questLine.textContent');
    expect(game).toContain('loadState');
    expect(game).toContain('writeSave');
    expect(game).toContain('AudioContext');
    expect(game).toContain('[data-hold]');
    expect(game).toContain('setPaused');
    expect(game).toContain('pointers');
    expect(game).toContain('panelOpen');
    expect(game).toContain('Confirm restart');
    expect(game).toContain('touch.left');
    expect(game).toContain('configureCamera');
    expect(game).toContain('startFollow');
    expect(game).toContain('setBounds');
    expect(game).toContain('cameraZoom');
    expect(game).toContain('centerOn');
    expect(game).toContain('resetView');
    expect(game).toMatch(/ensureActors[\s\S]{0,400}configureCamera/);
    expect(game).toContain('scale.off');
    const css = readFileSync(join(outDir, 'style.css'), 'utf8');
    expect(css).toContain('@media (pointer: coarse)');
    expect(css).toContain('body.paused #touch-controls');
    expect(game).toContain('Object.values(state.inventory).reduce');

    const verified = verifyWebProject({ projectDir: outDir, frames: 900 });
    expect(verified.passed).toBe(true);
    expect(verified.stdout).toContain('WEB_MAP_OK');
    expect(verified.stdout).toContain('WEB_QUEST_COMPLETE');
  });

  it('refuses overwrite unless forced', () => {
    const outDir = join(makeTempDir('gamedream web overwrite '), 'web game');
    composeWebProject({ outDir, templatesDir });
    expect(() => composeWebProject({ outDir, templatesDir })).toThrow(/pass --force/);
    expect(() =>
      composeWebProject({ outDir, templatesDir, force: true }),
    ).not.toThrow();
  });

  it('fails verification when a marker or required file is missing', () => {
    const outDir = join(makeTempDir('gamedream web marker '), 'web game');
    composeWebProject({ outDir, templatesDir });
    writeFileSync(join(outDir, 'sim-run.mjs'), "console.log('WEB_BOOT_OK');\n", 'utf8');
    const missingMarker = verifyWebProject({ projectDir: outDir });
    expect(missingMarker.passed).toBe(false);
    expect(missingMarker.message).toContain('WEB_WIN');

    const fileDir = join(makeTempDir('gamedream web file '), 'web game');
    composeWebProject({ outDir: fileDir, templatesDir });
    unlinkSync(join(fileDir, 'game.js'));
    const missingFile = verifyWebProject({ projectDir: fileDir });
    expect(missingFile.passed).toBe(false);
    expect(missingFile.message).toContain('missing game.js');
  });
});

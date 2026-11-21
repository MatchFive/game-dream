import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
// @ts-ignore - the template ships plain ESM without a declaration file
import { clampMusicVolume, findBgmTrack } from '../../../templates/web-survivor/audio.mjs';
// @ts-ignore - the template ships plain ESM without a declaration file
import { atlasFrameRect, findAnimationEntry, frameAtTime } from '../../../templates/web-survivor/animation.mjs';
import { webComposeCommand, webVerifyCommand } from '../src/commands/web.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('Web survivor', () => {
  it('composes and wins headlessly', () => {
    const outDir = join(makeTempDir('gamedream web survivor '), 'game');
    const result = webComposeCommand({
      outDir,
      templatesDir: join(root, 'templates/web-survivor'),
      name: 'ember-survivor',
    });
    expect(result.config.name).toBe('ember-survivor');
    const verified = webVerifyCommand({ projectDir: outDir, frames: 1800 });
    expect(verified.passed).toBe(true);
    expect(verified.stdout).toContain('WEB_BOOT_OK');
    expect(verified.stdout).toContain('WEB_WIN');
  });

  it('finds a staged BGM track and clamps music volume', () => {
    const manifest = {
      assets: [
        { kind: 'sprite', file: 'game/build-assets/studio/player.png' },
        { kind: 'audio', file: 'game/build-assets/studio/bgm.mp3' },
      ],
    };
    expect(findBgmTrack(manifest)?.file).toBe('game/build-assets/studio/bgm.mp3');
    expect(findBgmTrack({ assets: [] })).toBeUndefined();
    expect(clampMusicVolume(2)).toBe(1);
    expect(clampMusicVolume(-1)).toBe(0);
    expect(clampMusicVolume('bad')).toBeCloseTo(0.35);
    const animation = findAnimationEntry({
      animations: [{
        name: 'walk',
        image: 'game/build-assets/animations/walk.png',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 4,
        fps: 8,
        loop: true,
      }],
    });
    expect(animation?.name).toBe('walk');
    expect(frameAtTime(animation, 0.3)).toBe(2);
    expect(atlasFrameRect(animation, 3)).toEqual({
      x: 96,
      y: 0,
      width: 32,
      height: 32,
    });
  });

  it('wires the staged BGM loader into every Web genre template', () => {
    for (const template of [
      'web-platformer',
      'web-roguelike',
      'web-puzzle',
      'web-shooter',
      'web-tower-defense',
    ]) {
      const dir = join(root, 'templates', template);
      expect(existsSync(join(dir, 'audio.mjs'))).toBe(true);
      const game = readFileSync(join(dir, 'game.js'), 'utf8');
      expect(game).toContain("from './audio.mjs'");
      expect(game).toContain('findBgmTrack');
      expect(game).toContain('game/build-assets/manifest.json');
      expect(game).toContain("addEventListener('pointerdown', playBgm");
    }
  });
});

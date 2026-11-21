import { describe, expect, it } from 'vitest';
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
});

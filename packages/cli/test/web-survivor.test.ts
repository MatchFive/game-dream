import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
// @ts-ignore - the template ships plain ESM without a declaration file
import { clampMusicVolume, findBgmTrack } from '../../../templates/web-survivor/audio.mjs';
// @ts-ignore - the template ships plain ESM without a declaration file
import { atlasFrameRect, findAnimationEntry, frameAtTime } from '../../../templates/web-survivor/animation.mjs';
// @ts-ignore - the template ships plain ESM without a declaration file
import { findPlayerBinding } from '../../../templates/web-survivor/bindings.mjs';
// @ts-ignore - the template ships plain ESM without a declaration file
import { createSim as createSurvivorSim, step as stepSurvivor } from '../../../templates/web-survivor/sim.mjs';
// @ts-ignore - the template ships plain ESM without a declaration file
import {
  defaultMeta,
  grantMeta,
  readMeta,
  upgradeMeta,
  writeMeta,
} from '../../../templates/web-survivor/meta.mjs';
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
    expect(
      findPlayerBinding({
        player: { file: 'game/build-assets/studio/hero.png' },
      })?.file,
    ).toBe('game/build-assets/studio/hero.png');
    expect(findPlayerBinding({ player: { file: '' } })).toBeUndefined();
    expect(findPlayerBinding({})).toBeUndefined();
    expect(findBgmTrack({ assets: [] })).toBeUndefined();
    expect(
      findBgmTrack({
        assets: [
          { kind: 'audio', file: 'game/build-assets/studio/sfx-coin.wav' },
          { kind: 'audio', file: 'game/build-assets/studio/bgm.mp3' },
        ],
      })?.file,
    ).toBe('game/build-assets/studio/bgm.mp3');
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

  it('runs elites, weapon evolution, and persistent meta', () => {
    const state = createSurvivorSim();
    for (let frame = 0; frame < 1800 && !state.finished; frame += 1) {
      stepSurvivor(state, { auto: true }, 1 / 60);
    }
    expect(state.finished).toBe('win');
    expect(state.eliteKills).toBeGreaterThan(0);
    expect(state.evolution).toBe('storm');
    expect(state.coins).toBeGreaterThan(0);

    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
    };
    let meta = readMeta(storage);
    expect(meta).toEqual(defaultMeta());
    meta = grantMeta(meta, state);
    expect(meta.runs).toBe(1);
    expect(meta.wins).toBe(1);
    expect(meta.coins).toBe(state.coins);
    writeMeta(storage, meta);
    const upgraded = upgradeMeta(readMeta(storage), 'damage');
    expect(upgraded.damage).toBe(1);
    expect(upgraded.coins).toBe(meta.coins - 5);
    expect(upgradeMeta({ ...upgraded, coins: 0 }, 'hp').maxHp).toBe(0);
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

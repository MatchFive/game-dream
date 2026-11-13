import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));

async function modules() {
  return {
    sim: await import(pathToFileURL(join(root, 'templates/web-m0/sim.mjs')).href),
    save: await import(pathToFileURL(join(root, 'templates/web-m0/save.mjs')).href),
    settings: await import(pathToFileURL(join(root, 'templates/web-m0/settings.mjs')).href),
  };
}

class MemoryStorage {
  constructor() {
    this.data = new Map();
  }
  getItem(key) {
    return this.data.get(key) ?? null;
  }
  setItem(key, value) {
    this.data.set(key, String(value));
  }
  removeItem(key) {
    this.data.delete(key);
  }
}

const config = {
  name: 'save-test',
  arena: { width: 320, height: 160 },
  player: { hp: 100, damage: 15, speed: 220, attack_range: 64, attack_cooldown: 0.25 },
  enemy: { hp: 30, damage: 5, speed: 70, attack_range: 40, attack_cooldown: 1 },
  quests: [{ id: 'slimes', title: 'Slimes', type: 'kill', target: 'slime', count: 2 }],
  levels: [
    { id: 'one', name: 'One', map: null, enemy: { kind: 'slime', max_hp: 30, attack_damage: 5, speed: 70, x: 200, y: 80, scale: 1 } },
    { id: 'two', name: 'Two', map: null, enemy: { kind: 'slime', max_hp: 30, attack_damage: 5, speed: 70, x: 220, y: 80, scale: 1 } },
  ],
};

describe('web save', () => {
  it('round-trips level, HP, inventory, and quests', async () => {
    const { sim, save } = await modules();
    const state = sim.createSim(config);
    sim.startLevel(state, 1);
    state.player.hp = 42;
    state.inventory['Slime Gel'] = 3;
    state.quests[0].progress = 1;
    const snapshot = save.snapshot(state);

    sim.startLevel(state, 0);
    state.player.hp = 100;
    state.inventory = {};
    state.quests[0].progress = 0;

    expect(save.restoreState(state, snapshot)).toBe(true);
    expect(state.levelIndex).toBe(1);
    expect(state.player.hp).toBe(42);
    expect(state.inventory['Slime Gel']).toBe(3);
    expect(state.quests[0].progress).toBe(1);
  });

  it('uses content-specific save keys and clamps edge values', async () => {
    const { sim, save } = await modules();
    const first = { ...config, levels: [{ ...config.levels[0], id: 'first' }] };
    const second = { ...config, levels: [{ ...config.levels[0], id: 'second' }] };
    expect(save.saveKeyFor(first)).not.toBe(save.saveKeyFor(second));

    const state = sim.createSim(config);
    state.player.hp = 1;
    state.levelIndex = 0;
    const restored = sim.createSim(config);
    expect(save.restoreState(restored, { ...save.snapshot(state), hp: 999, level: 0 })).toBe(true);
    expect(restored.player.hp).toBe(config.player.hp);
    expect(save.restoreState(restored, { ...save.snapshot(state), level: 99 })).toBe(false);
    expect(save.restoreState(restored, { ...save.snapshot(state), version: 0 })).toBe(false);
  });

  it('persists, loads, rejects corrupt saves, and resets', async () => {
    const { sim, save } = await modules();
    const storage = new MemoryStorage();
    const state = sim.createSim(config);
    state.inventory['Slime Gel'] = 1;
    expect(save.writeSave(storage, 'save', state)).toBe(true);
    const loaded = sim.createSim(config);
    expect(save.loadState(storage, 'save', loaded)).toBe(true);
    expect(loaded.inventory['Slime Gel']).toBe(1);

    storage.setItem('save', '{bad json');
    expect(save.loadState(storage, 'save', loaded)).toBe(false);
    expect(storage.getItem('save')).toBeNull();

    loaded.levelIndex = 1;
    loaded.inventory['Boss Core'] = 1;
    save.resetState(loaded);
    expect(loaded.levelIndex).toBe(0);
    expect(loaded.inventory).toEqual({});
    expect(loaded.quests[0].progress).toBe(0);

    const throwing = {
      getItem() {
        return null;
      },
      setItem() {
        throw new Error('quota');
      },
      removeItem() {
        throw new Error('quota');
      },
    };
    expect(save.writeSave(throwing, 'save', state)).toBe(false);
    expect(save.clearSave(throwing, 'save')).toBe(false);
  });
});

describe('web settings', () => {
  it('clamps values and persists defaults', async () => {
    const { settings } = await modules();
    const storage = new MemoryStorage();
    expect(settings.readSettings(storage)).toMatchObject({ music: 0.35, sfx: 0.7 });
    storage.setItem('bad', JSON.stringify({ music: null, sfx: true, fullscreen: 'yes' }));
    expect(settings.readSettings(storage, 'bad')).toEqual({ music: 0.35, sfx: 0.7, fullscreen: false });
    const normalized = settings.writeSettings(storage, { music: 9, sfx: -1, fullscreen: true });
    expect(normalized).toEqual({ music: 1, sfx: 0, fullscreen: true });
    expect(settings.readSettings(storage)).toEqual(normalized);
  });
});

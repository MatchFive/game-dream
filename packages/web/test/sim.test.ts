import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));

async function loadSim() {
  return import(pathToFileURL(join(root, 'templates/web-m0/sim.mjs')).href);
}

const config = {
  name: 'test',
  arena: { width: 320, height: 160 },
  player: { hp: 100, damage: 15, speed: 220, attack_range: 64, attack_cooldown: 0.25 },
  enemy: { hp: 30, damage: 5, speed: 70, attack_range: 40, attack_cooldown: 1 },
};

describe('web sim', () => {
  it('blocks movement into wall tiles', async () => {
    const sim = await loadSim();
    const state = sim.createSim({
      ...config,
      levels: [
        {
          id: 'walled',
          name: 'Walled',
          map: {
            rows: ['#####', '#...#', '#####'],
            tile_size: 32,
            tileset: { floor: '2f5d3a', wall: '1b3324' },
          },
          enemy: { kind: 'slime', max_hp: 30, attack_damage: 5, speed: 70, x: 120, y: 48, scale: 1 },
        },
      ],
    });
    state.player.x = 48;
    state.player.y = 48;
    for (let i = 0; i < 20; i += 1) {
      sim.step(state, { left: true }, 1 / 60);
    }
    expect(state.player.x).toBeGreaterThanOrEqual(44);
    expect(sim.isWall(state, 20, 48)).toBe(true);
  });

  it('adds loot and completes kill quests', async () => {
    const sim = await loadSim();
    const state = sim.createSim({
      ...config,
      levels: [
        {
          id: 'arena',
          name: 'Arena',
          map: null,
          enemy: { kind: 'slime', max_hp: 15, attack_damage: 5, speed: 0, x: 140, y: 80, scale: 1 },
        },
      ],
      quests: [{ id: 'kill', title: 'Slime', type: 'kill', target: 'slime', count: 1 }],
    });
    state.player.x = 100;
    state.player.y = 80;
    sim.step(state, { attack: true }, 1 / 60);
    expect(state.finished).toBe('win');
    expect(state.inventory['Slime Gel']).toBe(1);
    expect(state.quests[0].completed).toBe(true);
  });
});

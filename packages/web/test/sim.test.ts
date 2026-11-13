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

  it('snaps spawns out of walls and has no walls without a map', async () => {
    const sim = await loadSim();
    const m0 = sim.createSim(config);
    expect(sim.isWall(m0, 0, 0)).toBe(false);

    const state = sim.createSim({
      ...config,
      levels: [
        {
          id: 'spawn',
          name: 'Spawn',
          map: {
            rows: ['#####', '##.##', '#####'],
            tile_size: 32,
            tileset: { floor: '2f5d3a', wall: '1b3324' },
          },
          enemy: { kind: 'slime', max_hp: 30, attack_damage: 5, speed: 0, x: 80, y: 48, scale: 1 },
        },
      ],
    });
    expect(sim.isWall(state, state.player.x, state.player.y, 12)).toBe(false);
    expect(state.player.x).toBe(80);
  });

  it('samples the whole boss box against thin walls', async () => {
    const sim = await loadSim();
    const rows = [
      '############',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#.......#..#',
      '#..........#',
      '############',
    ];
    const state = sim.createSim({
      ...config,
      levels: [
        {
          id: 'boss',
          name: 'Boss',
          map: { rows, tile_size: 32, tileset: { floor: '2f5d3a', wall: '1b3324' } },
          enemy: { kind: 'boss', max_hp: 120, attack_damage: 8, speed: 70, x: 700, y: 240, scale: 1.8 },
        },
      ],
    });
    expect(sim.isWall(state, 272, 176, 21.6)).toBe(true);
  });

  it('uses configured ranges, phases a boss once, and resets the run state', async () => {
    const sim = await loadSim();
    const state = sim.createSim({
      ...config,
      levels: [
        {
          id: 'boss',
          name: 'Boss',
          map: null,
          enemy: {
            kind: 'boss',
            max_hp: 30,
            attack_damage: 5,
            attack_range: 120,
            speed: 70,
            x: 140,
            y: 80,
            scale: 1,
          },
        },
      ],
    });
    expect(state.enemy.attack_range).toBe(120);
    state.player.x = 100;
    state.player.y = 80;
    sim.step(state, { attack: true }, 1 / 60);
    expect(state.bossPhase).toBe(true);
    expect(state.enemy.phase).toBe(true);
    const speed = state.enemy.speed;
    sim.step(state, { attack: true }, 1 / 60);
    expect(state.enemy.speed).toBe(speed);

    const save = await import('../../../templates/web-m0/save.mjs');
    save.resetState(state);
    expect(state.bossPhase).toBe(false);
    expect(state.enemy.phase).toBe(false);
  });

  it('uses the configured attack range when no level data exists', async () => {
    const sim = await loadSim();
    const state = sim.createSim({ ...config, enemy: { ...config.enemy, attack_range: 90 } });
    expect(state.enemy.attack_range).toBe(90);
  });

  it('adds boss loot and completes kill quests', async () => {
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

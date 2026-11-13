export function createSim(config) {
  const levels = config.levels?.length
    ? config.levels
    : [
        {
          id: 'arena',
          name: 'Arena',
          map: null,
          enemy: {
            kind: 'slime',
            max_hp: config.enemy.hp,
            attack_damage: config.enemy.damage,
            speed: config.enemy.speed,
            x: config.arena.width - 220,
            y: config.arena.height / 2,
            scale: 1,
          },
        },
      ];
  const state = {
    config,
    levels,
    levelIndex: 0,
    time: 0,
    finished: null,
    inventory: 0,
    quests: (config.quests ?? []).map((quest) => ({
      ...quest,
      progress: 0,
      completed: false,
    })),
    player: {
      x: 100,
      y: config.arena.height / 2,
      hp: config.player.hp,
      cooldown: 0,
    },
    enemy: { x: 0, y: 0, hp: 0, kind: 'slime', scale: 1, cooldown: 0 },
    map: null,
  };
  startLevel(state, 0);
  return state;
}

export function startLevel(state, index) {
  const level = state.levels[index];
  state.levelIndex = index;
  state.map = level.map;
  const height = level.map
    ? level.map.rows.length * level.map.tile_size
    : state.config.arena.height;
  state.player.x = 100;
  state.player.y = height / 2;
  state.player.hp = state.config.player.hp;
  state.player.cooldown = 0;
  state.enemy = {
    x: level.enemy.x,
    y: level.enemy.y,
    hp: level.enemy.max_hp,
    kind: level.enemy.kind,
    scale: level.enemy.scale ?? 1,
    cooldown: 0,
    speed: level.enemy.speed,
    damage: level.enemy.attack_damage,
  };
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function completeKillQuests(state, kind) {
  for (const quest of state.quests) {
    if (quest.completed || quest.type !== 'kill' || quest.target !== kind) continue;
    quest.progress += 1;
    if (quest.progress >= quest.count) quest.completed = true;
  }
}

export function step(state, input, dt) {
  if (state.finished) return state;
  const player = state.player;
  const enemy = state.enemy;
  const config = state.config;

  const width = state.map
    ? state.map.rows[0].length * state.map.tile_size
    : config.arena.width;
  const height = state.map
    ? state.map.rows.length * state.map.tile_size
    : config.arena.height;
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const length = Math.hypot(dx, dy) || 1;
  player.x += (dx / length) * config.player.speed * dt;
  player.y += (dy / length) * config.player.speed * dt;
  player.x = Math.max(16, Math.min(width - 16, player.x));
  player.y = Math.max(16, Math.min(height - 16, player.y));

  const gap = distance(player, enemy);
  if (gap > config.enemy.attack_range) {
    const ex = player.x - enemy.x;
    const ey = player.y - enemy.y;
    const el = Math.hypot(ex, ey) || 1;
    enemy.x += (ex / el) * enemy.speed * dt;
    enemy.y += (ey / el) * enemy.speed * dt;
    enemy.x = Math.max(16, Math.min(width - 16, enemy.x));
    enemy.y = Math.max(16, Math.min(height - 16, enemy.y));
  } else {
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    if (enemy.cooldown <= 0) {
      enemy.cooldown = config.enemy.attack_cooldown;
      player.hp -= enemy.damage;
    }
  }

  player.cooldown = Math.max(0, player.cooldown - dt);
  if (
    input.attack &&
    player.cooldown <= 0 &&
    distance(player, enemy) <= config.player.attack_range
  ) {
    player.cooldown = config.player.attack_cooldown;
    enemy.hp -= config.player.damage;
  }

  if (enemy.hp <= 0) {
    state.inventory += 1;
    completeKillQuests(state, enemy.kind);
    if (state.levelIndex + 1 < state.levels.length) {
      startLevel(state, state.levelIndex + 1);
    } else {
      state.finished = 'win';
    }
  } else if (player.hp <= 0) {
    state.finished = 'lose';
  }

  state.time += dt;
  return state;
}

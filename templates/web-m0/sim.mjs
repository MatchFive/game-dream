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
    bossPhase: false,
    lootRng: 42,
    inventory: {},
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
  if (index === 0) state.bossPhase = false;
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
    max_hp: level.enemy.max_hp,
    kind: level.enemy.kind,
    scale: level.enemy.scale ?? 1,
    cooldown: 0,
    speed: level.enemy.speed,
    damage: level.enemy.attack_damage,
    attack_range: level.enemy.attack_range ?? state.config.enemy.attack_range ?? 40,
    attack_cooldown: level.enemy.attack_cooldown ?? state.config.enemy.attack_cooldown ?? 1,
    phase: false,
  };
  snapToFloor(state, state.player, 12);
  snapToFloor(state, state.enemy, 12 * state.enemy.scale);
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function tileAt(state, x, y) {
  if (!state.map) return '.';
  const size = state.map.tile_size;
  const tx = Math.floor(x / size);
  const ty = Math.floor(y / size);
  if (ty < 0 || ty >= state.map.rows.length) return '#';
  const row = state.map.rows[ty];
  if (tx < 0 || tx >= row.length) return '#';
  return row[tx];
}

export function isWall(state, x, y, half = 12) {
  if (!state.map) return false;
  const size = state.map.tile_size;
  const x0 = Math.floor((x - half) / size);
  const x1 = Math.floor((x + half - 1e-6) / size);
  const y0 = Math.floor((y - half) / size);
  const y1 = Math.floor((y + half - 1e-6) / size);
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) {
      if (tileAt(state, tx * size + size / 2, ty * size + size / 2) === '#') {
        return true;
      }
    }
  }
  return false;
}

function snapToFloor(state, actor, half) {
  if (!state.map || !isWall(state, actor.x, actor.y, half)) return;
  const size = state.map.tile_size;
  let best = null;
  let bestDistance = Infinity;
  for (let ty = 0; ty < state.map.rows.length; ty += 1) {
    for (let tx = 0; tx < state.map.rows[ty].length; tx += 1) {
      if (state.map.rows[ty][tx] === '#') continue;
      const x = tx * size + size / 2;
      const y = ty * size + size / 2;
      if (isWall(state, x, y, half)) continue;
      const d = Math.hypot(x - actor.x, y - actor.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = { x, y };
      }
    }
  }
  if (best) {
    actor.x = best.x;
    actor.y = best.y;
  }
}

function hasLineOfSight(state, a, b) {
  if (!state.map) return true;
  const steps = Math.ceil(distance(a, b) / (state.map.tile_size / 2));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (tileAt(state, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) === '#') {
      return false;
    }
  }
  return true;
}

function moveActor(state, actor, dx, dy, half) {
  const nextX = actor.x + dx;
  if (!isWall(state, nextX, actor.y, half)) actor.x = nextX;
  const nextY = actor.y + dy;
  if (!isWall(state, actor.x, nextY, half)) actor.y = nextY;
}

function nextLootRoll(state) {
  state.lootRng = (Math.imul(state.lootRng, 1664525) + 1013904223) >>> 0;
  return state.lootRng / 4294967296;
}

function addLoot(state, kind) {
  const table = state.config.loot?.[kind];
  if (Array.isArray(table)) {
    for (const drop of table) {
      if (!drop.item_id) continue;
      const chance = Number.isFinite(drop.chance) ? drop.chance : 0;
      if (chance < 1 && nextLootRoll(state) > chance) continue;
      const name = state.config.items?.[drop.item_id] ?? drop.item_id;
      state.inventory[name] = (state.inventory[name] ?? 0) + 1;
    }
    return;
  }
  if (kind === 'slime') {
    state.inventory['Slime Gel'] = (state.inventory['Slime Gel'] ?? 0) + 1;
  }
}

function completeKillQuests(state, kind) {
  for (const quest of state.quests) {
    if (quest.completed || quest.type !== 'kill' || quest.target !== kind) continue;
    quest.progress += 1;
    if (quest.progress >= quest.count) quest.completed = true;
  }
}

export function step(state, input, rawDt) {
  if (state.finished) return state;
  const dt = Math.min(rawDt, 1 / 30);
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
  moveActor(
    state,
    player,
    (dx / length) * config.player.speed * dt,
    (dy / length) * config.player.speed * dt,
    12,
  );
  if (!state.map) {
    player.x = Math.max(16, Math.min(width - 16, player.x));
    player.y = Math.max(16, Math.min(height - 16, player.y));
  }

  const gap = distance(player, enemy);
  if (gap > enemy.attack_range || !hasLineOfSight(state, player, enemy)) {
    const ex = player.x - enemy.x;
    const ey = player.y - enemy.y;
    const el = Math.hypot(ex, ey) || 1;
    moveActor(
      state,
      enemy,
      (ex / el) * enemy.speed * dt,
      (ey / el) * enemy.speed * dt,
      12 * enemy.scale,
    );
    if (!state.map) {
      enemy.x = Math.max(16, Math.min(width - 16, enemy.x));
      enemy.y = Math.max(16, Math.min(height - 16, enemy.y));
    }
  } else {
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    if (enemy.cooldown <= 0) {
      enemy.cooldown = enemy.attack_cooldown;
      if (hasLineOfSight(state, player, enemy)) player.hp -= enemy.damage;
    }
  }

  player.cooldown = Math.max(0, player.cooldown - dt);
  if (
    input.attack &&
    player.cooldown <= 0 &&
    distance(player, enemy) <= config.player.attack_range &&
    hasLineOfSight(state, player, enemy)
  ) {
    player.cooldown = config.player.attack_cooldown;
    enemy.hp -= config.player.damage;
  }

  if (
    enemy.kind === 'boss' &&
    !enemy.phase &&
    enemy.hp > 0 &&
    enemy.hp <= enemy.max_hp * 0.5
  ) {
    state.bossPhase = true;
    enemy.phase = true;
    enemy.speed *= 1.35;
    enemy.damage = Math.ceil(enemy.damage * 1.5);
    enemy.attack_cooldown *= 0.7;
  }

  if (enemy.hp <= 0) {
    addLoot(state, enemy.kind);
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

export const ARENA = { width: 960, height: 540 };
export const PLAYER_SPEED = 245;
export const PLAYER_RADIUS = 17;
export const PLAYER_HP = 100;
export const TOTAL_WAVES = 3;
export const ENEMIES_PER_WAVE = 4;
export const FIRE_INTERVAL = 0.16;
export const BULLET_SPEED = 760;

const SPAWNS = [
  { x: 60, y: 60 },
  { x: 480, y: 50 },
  { x: 900, y: 60 },
  { x: 70, y: 480 },
  { x: 890, y: 480 },
];

export function createSim() {
  const state = {
    player: { x: 480, y: 270, hp: PLAYER_HP },
    enemies: [],
    bullets: [],
    wave: 1,
    kills: 0,
    fireTimer: 0,
    time: 0,
    finished: null,
  };
  spawnWave(state);
  return state;
}

function spawnWave(state) {
  for (let i = 0; i < ENEMIES_PER_WAVE; i += 1) {
    const spawn = SPAWNS[(i + state.wave - 1) % SPAWNS.length];
    const hp = 2 + (state.wave - 1);
    state.enemies.push({
      x: spawn.x,
      y: spawn.y,
      hp,
      maxHp: hp,
      speed: 55 + state.wave * 8,
      radius: 13,
    });
  }
}

function nearestEnemy(state) {
  let best = null;
  let bestDistance = Infinity;
  for (const enemy of state.enemies) {
    const distance = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
    if (distance < bestDistance) {
      best = enemy;
      bestDistance = distance;
    }
  }
  return best;
}

export function step(state, input = {}, dt = 1 / 60) {
  if (state.finished) return state;
  state.time += dt;
  const auto = Boolean(input.auto);
  const player = state.player;

  if (!auto) {
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const length = Math.hypot(dx, dy) || 1;
    player.x = Math.max(30, Math.min(930, player.x + (dx / length) * PLAYER_SPEED * dt));
    player.y = Math.max(30, Math.min(510, player.y + (dy / length) * PLAYER_SPEED * dt));
  }

  state.fireTimer -= dt;
  const target = nearestEnemy(state);
  if (state.fireTimer <= 0 && target) {
    state.fireTimer = FIRE_INTERVAL;
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const length = Math.hypot(dx, dy) || 1;
    state.bullets.push({
      x: player.x,
      y: player.y,
      vx: (dx / length) * BULLET_SPEED,
      vy: (dy / length) * BULLET_SPEED,
    });
  }

  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = state.bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    let hit = false;
    for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
      const enemy = state.enemies[j];
      if (Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) <= enemy.radius + 4) {
        enemy.hp -= 1;
        hit = true;
        if (enemy.hp <= 0) {
          state.enemies.splice(j, 1);
          state.kills += 1;
        }
        break;
      }
    }
    if (hit || bullet.x < 0 || bullet.x > ARENA.width || bullet.y < 0 || bullet.y > ARENA.height) {
      state.bullets.splice(i, 1);
    }
  }

  for (const enemy of state.enemies) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const length = Math.hypot(dx, dy) || 1;
    if (length > PLAYER_RADIUS + enemy.radius) {
      enemy.x += (dx / length) * enemy.speed * dt;
      enemy.y += (dy / length) * enemy.speed * dt;
    } else {
      player.hp -= 14 * dt;
    }
  }

  if (state.enemies.length === 0 && state.wave >= TOTAL_WAVES) {
    state.finished = 'win';
  } else if (state.enemies.length === 0) {
    state.wave += 1;
    spawnWave(state);
  }
  if (player.hp <= 0) {
    player.hp = 0;
    state.finished = 'lose';
  }
  return state;
}

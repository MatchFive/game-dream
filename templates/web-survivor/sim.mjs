export const RUN_SECONDS = 20;
export const ARENA = { width: 960, height: 540 };
const SPAWNS = [
  { x: 60, y: 60 },
  { x: 480, y: 50 },
  { x: 900, y: 60 },
  { x: 60, y: 480 },
  { x: 900, y: 480 },
];

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createSim() {
  const state = {
    player: { x: 480, y: 270, hp: 100, maxHp: 100 },
    enemies: [],
    bullets: [],
    time: 0,
    level: 1,
    xp: 0,
    nextXp: 4,
    kills: 0,
    spawnTimer: 0,
    attackTimer: 0,
    spawnIndex: 0,
    finished: null,
  };
  for (let i = 0; i < 5; i += 1) spawnEnemy(state);
  return state;
}

function spawnEnemy(state) {
  if (state.enemies.length >= 40) return;
  const point = SPAWNS[state.spawnIndex % SPAWNS.length];
  state.spawnIndex += 1;
  state.enemies.push({ x: point.x, y: point.y, hp: 1, radius: 13 });
}

function nearestEnemy(state) {
  let best = null;
  let bestDistance = Infinity;
  for (const enemy of state.enemies) {
    const d = distance(state.player, enemy);
    if (d < bestDistance) {
      best = enemy;
      bestDistance = d;
    }
  }
  return best;
}

export function step(state, input = {}, dt = 1 / 60) {
  if (state.finished) return state;
  state.time += dt;

  if (!input.auto) {
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const length = Math.hypot(dx, dy) || 1;
    state.player.x = Math.max(30, Math.min(930, state.player.x + (dx / length) * 230 * dt));
    state.player.y = Math.max(30, Math.min(510, state.player.y + (dy / length) * 230 * dt));
  }

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    state.spawnTimer = 0.8;
    spawnEnemy(state);
  }

  state.attackTimer -= dt;
  const target = nearestEnemy(state);
  if (state.attackTimer <= 0 && target) {
    state.attackTimer = 0.22;
    const d = distance(state.player, target) || 1;
    state.bullets.push({
      x: state.player.x,
      y: state.player.y,
      vx: ((target.x - state.player.x) / d) * 620,
      vy: ((target.y - state.player.y) / d) * 620,
    });
  }

  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = state.bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    let hit = false;
    for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
      if (distance(bullet, state.enemies[j]) <= state.enemies[j].radius) {
        state.enemies.splice(j, 1);
        state.kills += 1;
        state.xp += 1;
        hit = true;
        if (state.xp >= state.nextXp) {
          state.xp -= state.nextXp;
          state.level += 1;
          state.nextXp = 4 + state.level * 2;
        }
        break;
      }
    }
    if (hit || bullet.x < 0 || bullet.x > ARENA.width || bullet.y < 0 || bullet.y > ARENA.height) {
      state.bullets.splice(i, 1);
    }
  }

  for (const enemy of state.enemies) {
    const d = distance(state.player, enemy) || 1;
    if (d > 24) {
      enemy.x += ((state.player.x - enemy.x) / d) * 40 * dt;
      enemy.y += ((state.player.y - enemy.y) / d) * 40 * dt;
    } else {
      state.player.hp -= 8 * dt;
    }
  }

  if (state.player.hp <= 0) state.finished = 'lose';
  if (state.time >= RUN_SECONDS) state.finished = 'win';
  return state;
}

export const RUN_SECONDS = 20;
export const ARENA = { width: 960, height: 540 };
export const ELITE_EVERY = 7;
export const EVOLVE_LEVEL = 3;
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

export function createSim(meta = {}) {
  const maxHp = 100 + Math.max(0, Math.floor(Number(meta.maxHp) || 0));
  const damage = 1 + Math.max(0, Math.floor(Number(meta.damage) || 0));
  const state = {
    player: { x: 480, y: 270, hp: maxHp, maxHp },
    enemies: [],
    bullets: [],
    time: 0,
    level: 1,
    xp: 0,
    nextXp: 4,
    kills: 0,
    eliteKills: 0,
    coins: 0,
    spawnTimer: 0,
    attackTimer: 0,
    spawnIndex: 0,
    weapon: { level: 1, damage, cooldown: 0.22, evolved: false },
    evolution: null,
    finished: null,
  };
  for (let i = 0; i < 5; i += 1) spawnEnemy(state);
  return state;
}

function spawnEnemy(state) {
  if (state.enemies.length >= 40) return;
  const point = SPAWNS[state.spawnIndex % SPAWNS.length];
  const elite = state.spawnIndex > 0 && state.spawnIndex % ELITE_EVERY === 0;
  state.spawnIndex += 1;
  state.enemies.push({
    x: point.x,
    y: point.y,
    hp: elite ? 3 : 1,
    radius: elite ? 18 : 13,
    elite,
  });
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
    state.attackTimer = state.weapon.cooldown;
    const d = distance(state.player, target) || 1;
    state.bullets.push({
      x: state.player.x,
      y: state.player.y,
      vx: ((target.x - state.player.x) / d) * 620,
      vy: ((target.y - state.player.y) / d) * 620,
      damage: state.weapon.damage,
    });
  }

  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = state.bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    let hit = false;
    for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
      const enemy = state.enemies[j];
      if (distance(bullet, enemy) <= enemy.radius) {
        enemy.hp -= bullet.damage ?? 1;
        if (enemy.hp <= 0) {
          state.enemies.splice(j, 1);
          state.kills += 1;
          const reward = enemy.elite ? 3 : 1;
          state.xp += reward;
          state.coins += reward;
          if (enemy.elite) state.eliteKills += 1;
          if (state.xp >= state.nextXp) {
            state.xp -= state.nextXp;
            state.level += 1;
            state.nextXp = 4 + state.level * 2;
            state.weapon.level = Math.min(5, state.weapon.level + 1);
            if (state.weapon.level >= EVOLVE_LEVEL && !state.weapon.evolved) {
              state.weapon.evolved = true;
              state.weapon.damage += 1;
              state.weapon.cooldown = 0.17;
              state.evolution = 'storm';
            }
          }
        }
        hit = true;
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

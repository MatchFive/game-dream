export const ARENA = { width: 960, height: 540 };
export const TOTAL_WAVES = 5;
export const PATH = [
  { x: -30, y: 270 },
  { x: 250, y: 270 },
  { x: 250, y: 140 },
  { x: 540, y: 140 },
  { x: 540, y: 410 },
  { x: 800, y: 410 },
  { x: 800, y: 250 },
  { x: 1000, y: 250 },
];
const TOWER_SPOTS = [
  { x: 320, y: 210 },
  { x: 650, y: 330 },
  { x: 760, y: 330 },
];

export function createSim() {
  const state = {
    towers: TOWER_SPOTS.map((spot) => ({ ...spot, level: 0, cooldown: 0 })),
    enemies: [],
    bullets: [],
    gold: 120,
    baseHp: 20,
    wave: 0,
    waveActive: false,
    waveTimer: 0.2,
    finished: null,
  };
  startWave(state);
  return state;
}

function startWave(state) {
  state.wave += 1;
  state.waveActive = true;
  for (let i = 0; i < 2; i += 1) {
    state.enemies.push({ x: PATH[0].x, y: PATH[0].y, waypoint: 1, hp: 2 + state.wave });
  }
}

function autoManage(state) {
  for (const tower of state.towers) {
    if (tower.level === 0 && state.gold >= 25) {
      state.gold -= 25;
      tower.level = 1;
    } else if (tower.level > 0 && tower.level < 3 && state.gold >= 20) {
      state.gold -= 20;
      tower.level += 1;
    }
  }
}

function moveEnemies(state, dt) {
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = state.enemies[i];
    const target = PATH[enemy.waypoint];
    if (!target) {
      state.baseHp -= 2;
      state.enemies.splice(i, 1);
      continue;
    }
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const length = Math.hypot(dx, dy) || 1;
    const step = 125 * dt;
    if (length <= step) {
      enemy.x = target.x;
      enemy.y = target.y;
      enemy.waypoint += 1;
    } else {
      enemy.x += (dx / length) * step;
      enemy.y += (dy / length) * step;
    }
  }
}

function fireTowers(state, dt) {
  for (const tower of state.towers) {
    if (tower.level === 0) continue;
    tower.cooldown -= dt;
    if (tower.cooldown > 0) continue;
    let target = null;
    let best = Infinity;
    for (const enemy of state.enemies) {
      const distance = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
      if (distance < best && distance <= 180) {
        target = enemy;
        best = distance;
      }
    }
    if (!target) continue;
    tower.cooldown = Math.max(0.25, 0.9 - tower.level * 0.15);
    const dx = target.x - tower.x;
    const dy = target.y - tower.y;
    const length = Math.hypot(dx, dy) || 1;
    state.bullets.push({
      x: tower.x,
      y: tower.y,
      vx: (dx / length) * 700,
      vy: (dy / length) * 700,
      damage: tower.level,
    });
  }
}

function moveBullets(state, dt) {
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = state.bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    let hit = false;
    for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
      const enemy = state.enemies[j];
      if (Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) <= 18) {
        enemy.hp -= bullet.damage;
        hit = true;
        if (enemy.hp <= 0) {
          state.gold += 15;
          state.enemies.splice(j, 1);
        }
        break;
      }
    }
    if (hit) state.bullets.splice(i, 1);
  }
}

export function step(state, input = {}, dt = 1 / 60) {
  if (state.finished) return state;
  if (input.auto) autoManage(state);
  moveEnemies(state, dt);
  fireTowers(state, dt);
  moveBullets(state, dt);

  if (state.waveActive && state.enemies.length === 0) {
    state.waveActive = false;
    state.waveTimer = 0.45;
    if (state.wave >= TOTAL_WAVES) state.finished = 'win';
  } else if (!state.waveActive && state.wave < TOTAL_WAVES) {
    state.waveTimer -= dt;
    if (state.waveTimer <= 0) startWave(state);
  }
  if (state.baseHp <= 0) state.finished = 'lose';
  return state;
}

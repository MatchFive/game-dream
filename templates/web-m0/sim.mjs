export function createSim(config) {
  return {
    config,
    time: 0,
    finished: null,
    player: {
      x: 100,
      y: config.arena.height / 2,
      hp: config.player.hp,
      cooldown: 0,
    },
    enemy: {
      x: config.arena.width - 220,
      y: config.arena.height / 2,
      hp: config.enemy.hp,
      cooldown: 0,
    },
  };
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function step(state, input, dt) {
  if (state.finished) return state;
  const player = state.player;
  const enemy = state.enemy;
  const config = state.config;

  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const length = Math.hypot(dx, dy) || 1;
  player.x += (dx / length) * config.player.speed * dt;
  player.y += (dy / length) * config.player.speed * dt;
  player.x = Math.max(16, Math.min(config.arena.width - 16, player.x));
  player.y = Math.max(16, Math.min(config.arena.height - 16, player.y));

  const gap = distance(player, enemy);
  if (gap > config.enemy.attack_range) {
    const ex = player.x - enemy.x;
    const ey = player.y - enemy.y;
    const el = Math.hypot(ex, ey) || 1;
    enemy.x += (ex / el) * config.enemy.speed * dt;
    enemy.y += (ey / el) * config.enemy.speed * dt;
  } else {
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    if (enemy.cooldown <= 0) {
      enemy.cooldown = config.enemy.attack_cooldown;
      player.hp -= config.enemy.damage;
    }
  }

  player.cooldown = Math.max(0, player.cooldown - dt);
  if (input.attack && player.cooldown <= 0 && distance(player, enemy) <= config.player.attack_range) {
    player.cooldown = config.player.attack_cooldown;
    enemy.hp -= config.player.damage;
  }

  state.time += dt;
  if (enemy.hp <= 0) state.finished = 'win';
  else if (player.hp <= 0) state.finished = 'lose';
  return state;
}

export const ARENA = { width: 960, height: 540 };
export const GRAVITY = 1500;
export const PLAYER_SPEED = 240;
export const JUMP_SPEED = 560;
export const PLAYER = { width: 28, height: 40 };
export const GOAL = { x: 890, y: 408 };

export const platforms = [
  { x: 0, y: 470, w: 300, h: 70 },
  { x: 360, y: 470, w: 220, h: 70 },
  { x: 640, y: 470, w: 320, h: 70 },
  { x: 228, y: 360, w: 120, h: 18 },
  { x: 430, y: 300, w: 140, h: 18 },
  { x: 690, y: 340, w: 140, h: 18 },
];

const COIN_POSITIONS = [
  { x: 260, y: 330 },
  { x: 300, y: 430 },
  { x: 400, y: 330 },
  { x: 470, y: 270 },
  { x: 520, y: 330 },
  { x: 690, y: 310 },
  { x: 760, y: 310 },
  { x: 860, y: 430 },
];

export function createSim() {
  return {
    player: {
      x: 70,
      y: 430,
      vx: 0,
      vy: 0,
      onGround: false,
    },
    coins: COIN_POSITIONS.map((coin) => ({ ...coin, taken: false })),
    collected: 0,
    time: 0,
    finished: null,
  };
}

function overlaps(actor, platform) {
  return (
    actor.x + PLAYER.width > platform.x &&
    actor.x < platform.x + platform.w &&
    actor.y + PLAYER.height > platform.y &&
    actor.y < platform.y + platform.h
  );
}

function shouldAutoJump(state) {
  if (!state.player.onGround) return false;
  const x = state.player.x;
  return (x >= 235 && x <= 270) || (x >= 520 && x <= 555) || (x >= 740 && x <= 770);
}

export function step(state, input = {}, dt = 1 / 60) {
  if (state.finished) return state;
  state.time += dt;
  const player = state.player;
  const auto = Boolean(input.auto);
  const move = auto ? 1 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const jump = auto ? shouldAutoJump(state) : Boolean(input.jump);
  player.vx = move * PLAYER_SPEED;
  if (jump && player.onGround) {
    player.vy = -JUMP_SPEED;
    player.onGround = false;
  }
  player.vy = Math.min(1000, player.vy + GRAVITY * dt);
  player.x = Math.max(0, Math.min(ARENA.width - PLAYER.width, player.x + player.vx * dt));
  const previousY = player.y;
  player.y += player.vy * dt;
  player.onGround = false;
  for (const platform of platforms) {
    const wasAbove = previousY + PLAYER.height <= platform.y + 2;
    const sameColumn =
      player.x + PLAYER.width > platform.x && player.x < platform.x + platform.w;
    if (
      sameColumn &&
      player.vy >= 0 &&
      player.y < platform.y &&
      player.y + PLAYER.height >= platform.y
    ) {
      player.y = platform.y - PLAYER.height;
      player.vy = 0;
      player.onGround = true;
    } else if (wasAbove && sameColumn && player.vy >= 0) {
      player.y = platform.y - PLAYER.height;
      player.vy = 0;
      player.onGround = true;
    }
    if (overlaps(player, platform) && player.vy < 0) {
      player.y = platform.y + platform.h;
      player.vy = 0;
    }
  }
  for (const coin of state.coins) {
    if (coin.taken) continue;
    if (
      player.x + PLAYER.width > coin.x - 10 &&
      player.x < coin.x + 10 &&
      player.y + PLAYER.height > coin.y - 10 &&
      player.y < coin.y + 10
    ) {
      coin.taken = true;
      state.collected += 1;
    }
  }
  if (player.y > ARENA.height + 80) {
    state.finished = 'lose';
  } else if (
    player.x + PLAYER.width >= GOAL.x &&
    player.y + PLAYER.height >= 430
  ) {
    state.finished = 'win';
  }
  return state;
}

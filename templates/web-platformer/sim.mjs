import { STAGES, createStage } from './stages.mjs';

export const ARENA = { width: 960, height: 540 };
export const GRAVITY = 1500;
export const PLAYER_SPEED = 240;
export const JUMP_SPEED = 560;
export const PLAYER = { width: 28, height: 40 };
export const platforms = STAGES[0].platforms;
export const GOAL = STAGES[0].goal;

export function createSim() {
  const stage = createStage(STAGES[0]);
  return {
    stageIndex: 0,
    stage,
    player: {
      x: 70,
      y: 430,
      vx: 0,
      vy: 0,
      onGround: false,
    },
    coins: stage.coins,
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
  return state.stage.autoJumps.some(([start, end]) => x >= start && x <= end);
}

function nextStage(state) {
  if (state.stageIndex + 1 >= STAGES.length) {
    state.finished = 'win';
    return;
  }
  state.stageIndex += 1;
  state.stage = createStage(STAGES[state.stageIndex]);
  state.coins = state.stage.coins;
  state.player.x = 70;
  state.player.y = 430;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.onGround = false;
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
  for (const platform of state.stage.platforms) {
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
    player.x + PLAYER.width >= state.stage.goal.x &&
    player.y + PLAYER.height >= 430
  ) {
    nextStage(state);
  }
  return state;
}

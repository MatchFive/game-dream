export const ARENA = { width: 960, height: 540 };
export const TILE = 40;
export const OFFSET = 10;
export const COLS = 24;
export const ROWS = 13;
export const START = { x: 1, y: 1 };
export const EXIT = { x: 22, y: 11 };
import { buildRooms, roomShop } from './rooms.mjs';

const AUTO_PATH = [];
for (let x = 1; x <= 22; x += 1) AUTO_PATH.push({ x, y: 1 });
for (let y = 2; y <= 11; y += 1) AUTO_PATH.push({ x: 22, y });

const WALLS = new Set();
const key = (x, y) => `${x},${y}`;
for (let x = 0; x < COLS; x += 1) {
  WALLS.add(key(x, 0));
  WALLS.add(key(x, ROWS - 1));
}
for (let y = 0; y < ROWS; y += 1) {
  WALLS.add(key(0, y));
  WALLS.add(key(COLS - 1, y));
}
for (const [x, y, w, h] of [
  [4, 3, 5, 1],
  [12, 3, 1, 5],
  [4, 8, 6, 1],
  [16, 6, 4, 1],
  [16, 9, 1, 2],
]) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) WALLS.add(key(xx, yy));
  }
}

export function createSim(seed = 42) {
  const rooms = buildRooms(seed);
  const state = {
    seed: Number(seed) || 42,
    rooms,
    roomIndex: 0,
    room: rooms[0],
    roomEvents: [],
    relics: [],
    shop: [],
    gold: 0,
    player: { x: START.x, y: START.y, hp: 100, maxHp: 100 },
    enemies: [],
    pathIndex: 0,
    turn: 0,
    score: 0,
    moveTimer: 0,
    moveDelay: 0.09,
    time: 0,
    finished: null,
  };
  enterRoom(state);
  return state;
}

function enterRoom(state) {
  state.player.x = START.x;
  state.player.y = START.y;
  state.pathIndex = 0;
  state.moveTimer = 0;
  state.shop = roomShop(state.room);
  state.enemies = state.room.enemies.map((enemy, index) => ({
    x: enemy.x,
    y: enemy.y,
    hp: 1 + Math.floor((state.room.difficulty - 1) / 2),
  }));
  if (state.room.event === 'cache') {
    state.gold += 2;
    state.roomEvents.push(`${state.room.id}:cache`);
  } else if (state.room.event === 'ambush') {
    state.enemies.push({ x: 11, y: 4, hp: 1 });
    state.enemies.push({ x: 12, y: 8, hp: 1 });
    state.roomEvents.push(`${state.room.id}:ambush`);
  }
}

function advanceRoom(state) {
  state.gold += state.room.reward;
  if (state.room.shop) {
    const relic = state.shop.find((candidate) => state.gold >= candidate.cost);
    if (relic) {
      state.gold -= relic.cost;
      state.relics.push(relic.id);
      state.roomEvents.push(`${state.room.id}:bought:${relic.id}`);
      state.player.maxHp += relic.maxHp;
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + relic.maxHp);
      state.score += relic.score;
      state.moveDelay = Math.max(0.05, state.moveDelay - relic.moveDelay);
    }
  }
  if (state.roomIndex + 1 >= state.rooms.length) {
    state.finished = 'win';
    return;
  }
  state.roomIndex += 1;
  state.room = state.rooms[state.roomIndex];
  enterRoom(state);
}

export function isWall(x, y) {
  return WALLS.has(key(x, y));
}

function move(state, dx, dy) {
  const next = { x: state.player.x + dx, y: state.player.y + dy };
  if (isWall(next.x, next.y)) return;
  state.player.x = next.x;
  state.player.y = next.y;
  const hit = state.enemies.findIndex(
    (enemy) => enemy.x === state.player.x && enemy.y === state.player.y,
  );
  if (hit >= 0) {
    state.enemies.splice(hit, 1);
    state.score += 1;
  }
  if (state.player.x === EXIT.x && state.player.y === EXIT.y) {
    advanceRoom(state);
  }
}

export function step(state, input = {}, dt = 1 / 60) {
  if (state.finished) return state;
  state.time += dt;
  state.moveTimer -= dt;
  if (state.moveTimer > 0) return state;
  state.moveTimer = state.moveDelay;

  if (input.auto) {
    const next = AUTO_PATH[state.pathIndex];
    if (next) {
      move(state, Math.sign(next.x - state.player.x), Math.sign(next.y - state.player.y));
      state.pathIndex += 1;
    }
    state.turn += 1;
    return state;
  }

  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx !== 0 || dy !== 0) {
    move(state, dx, dy);
    state.turn += 1;
  }
  return state;
}

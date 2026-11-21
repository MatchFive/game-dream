export const TILE = 64;
export const ARENA = { width: 640, height: 448 };

const LEVELS = [
  {
    grid: [
      '#######',
      '#     #',
      '# .$@ #',
      '#     #',
      '#######',
    ],
    solution: ['left'],
  },
  {
    grid: [
      '#####',
      '# . #',
      '# $ #',
      '# @ #',
      '#####',
    ],
    solution: ['up'],
  },
  {
    grid: [
      '######',
      '#    #',
      '# .  #',
      '# $  #',
      '# @  #',
      '######',
    ],
    solution: ['up'],
  },
  {
    grid: [
      '########',
      '#      #',
      '#  .$@ #',
      '#      #',
      '########',
    ],
    solution: ['left'],
  },
];

export const LEVEL_COUNT = LEVELS.length;

function copyLevel(index) {
  const level = LEVELS[index];
  let player = { x: 1, y: 1 };
  const boxes = [];
  const targets = [];
  level.grid.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === '@') player = { x, y };
      if (cell === '$') boxes.push({ x, y });
      if (cell === '.') targets.push({ x, y });
    });
  });
  return {
    player,
    boxes,
    targets,
    solution: level.solution,
    width: level.grid[0].length,
    height: level.grid.length,
  };
}

export function createSim() {
  return {
    levelIndex: 0,
    ...copyLevel(0),
    levelCount: LEVEL_COUNT,
    moveIndex: 0,
    moveTimer: 0,
    pushes: 0,
    finished: null,
    message: 'Push the crystals onto the targets',
  };
}

function wall(state, x, y) {
  const rows = LEVELS[state.levelIndex].grid;
  return !rows[y] || rows[y][x] === '#';
}

function isTarget(state, x, y) {
  return state.targets.some((target) => target.x === x && target.y === y);
}

function solved(state) {
  return state.boxes.every((box) => isTarget(state, box.x, box.y));
}

function applyMove(state, direction) {
  const delta = {
    left: [-1, 0],
    right: [1, 0],
    up: [0, -1],
    down: [0, 1],
  }[direction];
  if (!delta) return;
  const nx = state.player.x + delta[0];
  const ny = state.player.y + delta[1];
  if (wall(state, nx, ny)) return;
  const box = state.boxes.find((item) => item.x === nx && item.y === ny);
  if (box) {
    const bx = nx + delta[0];
    const by = ny + delta[1];
    if (wall(state, bx, by) || state.boxes.some((item) => item.x === bx && item.y === by)) return;
    box.x = bx;
    box.y = by;
    state.pushes += 1;
  }
  state.player = { x: nx, y: ny };
  if (solved(state)) {
    if (state.levelIndex + 1 >= LEVELS.length) {
      state.finished = 'win';
      state.message = 'All circuits aligned';
    } else {
      state.levelIndex += 1;
      Object.assign(state, copyLevel(state.levelIndex));
      state.moveIndex = 0;
      state.message = 'Next chamber';
    }
  }
}

export function step(state, input = {}, dt = 1 / 60) {
  if (state.finished) return state;
  state.moveTimer -= dt;
  if (state.moveTimer > 0) return state;
  state.moveTimer = input.auto ? 0.18 : 0.1;
  if (input.auto) {
    const direction = state.solution[state.moveIndex];
    if (direction) {
      const previousLevel = state.levelIndex;
      applyMove(state, direction);
      state.moveIndex = state.levelIndex === previousLevel ? state.moveIndex + 1 : 0;
    }
  } else {
    const direction = input.left
      ? 'left'
      : input.right
        ? 'right'
        : input.up
          ? 'up'
          : input.down
            ? 'down'
            : '';
    if (direction) applyMove(state, direction);
  }
  return state;
}

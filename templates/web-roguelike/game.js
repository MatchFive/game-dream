import { ARENA, COLS, EXIT, OFFSET, ROWS, TILE, createSim, isWall, step } from './sim.mjs';

const root = document.querySelector('#game');
root.replaceChildren();
const canvas = document.createElement('canvas');
canvas.width = ARENA.width;
canvas.height = ARENA.height;
canvas.style.width = 'min(960px, 96vw)';
canvas.style.height = 'auto';
canvas.style.border = '1px solid #2f5d3a';
root.appendChild(canvas);
const ctx = canvas.getContext('2d');
let state = createSim();
const keys = new Set();
window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  keys.add(key);
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
  if (key === 'r' && state.finished) state = createSim();
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

function draw() {
  ctx.fillStyle = '#071018';
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      ctx.fillStyle = isWall(x, y) ? '#223349' : '#0d1b2c';
      ctx.fillRect(OFFSET + x * TILE, OFFSET + y * TILE, TILE - 1, TILE - 1);
    }
  }
  ctx.fillStyle = '#52e08a';
  ctx.fillRect(OFFSET + EXIT.x * TILE + 8, OFFSET + EXIT.y * TILE + 8, TILE - 17, TILE - 17);
  for (const enemy of state.enemies) {
    ctx.fillStyle = '#f04464';
    ctx.beginPath();
    ctx.arc(OFFSET + enemy.x * TILE + TILE / 2, OFFSET + enemy.y * TILE + TILE / 2, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#55d6ff';
  ctx.beginPath();
  ctx.arc(
    OFFSET + state.player.x * TILE + TILE / 2,
    OFFSET + state.player.y * TILE + TILE / 2,
    13,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.fillStyle = '#e8f5ee';
  ctx.font = '16px ui-monospace, monospace';
  ctx.fillText('NULL RUN', 20, 24);
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillStyle = '#a9c7df';
  ctx.fillText(`HP ${state.player.hp}   Score ${state.score}   Turn ${state.turn}   Reach the green exit`, 20, 46);
  if (state.finished) {
    ctx.fillStyle = 'rgb(5 10 16 / 82%)';
    ctx.fillRect(250, 220, 460, 100);
    ctx.fillStyle = '#e8f5ee';
    ctx.font = '28px ui-monospace, monospace';
    ctx.fillText('RUN COMPLETE', 355, 270);
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillStyle = '#a9c7df';
    ctx.fillText('Press R to restart', 430, 295);
  }
}

let last = performance.now();
let accumulator = 0;
function frame(now) {
  const delta = Math.min(0.1, (now - last) / 1000);
  last = now;
  accumulator += delta;
  while (accumulator >= 1 / 60) {
    step(
      state,
      {
        left: keys.has('a') || keys.has('arrowleft'),
        right: keys.has('d') || keys.has('arrowright'),
        up: keys.has('w') || keys.has('arrowup'),
        down: keys.has('s') || keys.has('arrowdown'),
      },
      1 / 60,
    );
    accumulator -= 1 / 60;
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

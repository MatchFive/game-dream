import { ARENA, TILE, createSim, step } from './sim.mjs';

const root = document.querySelector('#game');
root.replaceChildren();
const canvas = document.createElement('canvas');
canvas.width = ARENA.width;
canvas.height = ARENA.height;
canvas.style.width = 'min(640px, 96vw)';
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
  const width = state.levelIndex === 0 ? 7 : 5;
  const height = state.levelIndex === 0 ? 6 : 5;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const wall = y === 0 || y === height - 1 || x === 0 || x === width - 1;
      ctx.fillStyle = wall ? '#2c3c56' : '#0d1b2c';
      ctx.fillRect(x * TILE, y * TILE, TILE - 2, TILE - 2);
    }
  }
  for (const target of state.targets) {
    ctx.fillStyle = '#52e08a';
    ctx.fillRect(target.x * TILE + 18, target.y * TILE + 18, TILE - 38, TILE - 38);
  }
  for (const box of state.boxes) {
    ctx.fillStyle = '#ffd85e';
    ctx.fillRect(box.x * TILE + 10, box.y * TILE + 10, TILE - 22, TILE - 22);
    ctx.fillStyle = '#9a6b00';
    ctx.fillRect(box.x * TILE + 25, box.y * TILE + 25, TILE - 52, TILE - 52);
  }
  ctx.fillStyle = '#55d6ff';
  ctx.beginPath();
  ctx.arc(state.player.x * TILE + TILE / 2, state.player.y * TILE + TILE / 2, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#e8f5ee';
  ctx.font = '16px ui-monospace, monospace';
  ctx.fillText('CIRCUIT SHIFT', 20, 24);
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillStyle = '#a9c7df';
  ctx.fillText(
    `Chamber ${state.levelIndex + 1}/2   Pushes ${state.pushes}   ${state.message}`,
    20,
    46,
  );
  if (state.finished) {
    ctx.fillStyle = 'rgb(5 10 16 / 82%)';
    ctx.fillRect(120, 170, 400, 100);
    ctx.fillStyle = '#e8f5ee';
    ctx.font = '26px ui-monospace, monospace';
    ctx.fillText('CIRCUITS ALIGNED', 155, 220);
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillStyle = '#a9c7df';
    ctx.fillText('Press R to restart', 235, 245);
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

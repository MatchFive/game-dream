import { createSim, step } from './sim.mjs';

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const status = document.querySelector('#status');
const config = await fetch('./game.json').then((response) => response.json());
canvas.width = config.arena.width;
canvas.height = config.arena.height;
const state = createSim(config);
const keys = new Set();

window.addEventListener('keydown', (event) => keys.add(event.key.toLowerCase()));
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

function input() {
  return {
    left: keys.has('a') || keys.has('arrowleft'),
    right: keys.has('d') || keys.has('arrowright'),
    up: keys.has('w') || keys.has('arrowup'),
    down: keys.has('s') || keys.has('arrowdown'),
    attack: keys.has('j') || keys.has(' '),
  };
}

function draw() {
  ctx.fillStyle = '#1b3324';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#2f5d3a';
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  ctx.fillStyle = '#2ec4f1';
  ctx.fillRect(state.player.x - 12, state.player.y - 12, 24, 24);
  ctx.fillStyle = '#ef5350';
  ctx.fillRect(state.enemy.x - 12, state.enemy.y - 12, 24, 24);

  ctx.fillStyle = '#ffffff';
  ctx.font = '16px monospace';
  ctx.fillText(`HP ${Math.max(0, state.player.hp)}  Enemy ${Math.max(0, state.enemy.hp)}`, 16, 28);
  status.textContent = state.finished === 'win' ? 'Victory' : state.finished === 'lose' ? 'Defeat' : 'WASD move · J attack';
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(state, input(), dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

import { createSim, step } from './sim.mjs';

const canvas = document.querySelector('canvas');
const status = document.querySelector('#status');
window.addEventListener('error', (event) => {
  status.textContent = `Error: ${event.message}`;
});

try {
  const ctx = canvas.getContext('2d');
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
    status.textContent =
      state.finished === 'win'
        ? 'Victory'
        : state.finished === 'lose'
          ? 'Defeat'
          : 'WASD move · J attack';
  }

  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    accumulator += Math.min(0.25, (now - last) / 1000);
    last = now;
    let steps = 0;
    while (accumulator >= 1 / 60 && steps < 5) {
      step(state, input(), 1 / 60);
      accumulator -= 1 / 60;
      steps += 1;
    }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch (error) {
  status.textContent = `Failed to load: ${error.message}`;
  console.error(error);
}

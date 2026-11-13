import { createSim, step } from './sim.mjs';

const canvas = document.querySelector('canvas');
const status = document.querySelector('#status');
window.addEventListener('error', (event) => {
  status.textContent = `Error: ${event.message}`;
});

try {
  const ctx = canvas.getContext('2d');
  const config = await fetch('./game.json').then((response) => response.json());
  const state = createSim(config);
  const keys = new Set();
  const images = {};

  window.addEventListener('keydown', (event) => keys.add(event.key.toLowerCase()));
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

  function loadSprite(name, path) {
    if (!path) return;
    const image = new Image();
    image.src = path;
    image.onload = () => {
      images[name] = image;
    };
  }
  for (const [name, path] of Object.entries(config.sprites ?? {})) {
    loadSprite(name, path);
  }

  function color(value, fallback) {
    const hex = String(value ?? '').replace(/^#/, '');
    return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : fallback;
  }

  function resizeCanvas() {
    const width = state.map
      ? state.map.rows[0].length * state.map.tile_size
      : config.arena.width;
    const height = state.map
      ? state.map.rows.length * state.map.tile_size
      : config.arena.height;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function drawMap() {
    if (!state.map) {
      ctx.fillStyle = '#1b3324';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const size = state.map.tile_size;
    const colors = state.map.tileset ?? { floor: '2f5d3a', wall: '1b3324' };
    for (let y = 0; y < state.map.rows.length; y += 1) {
      for (let x = 0; x < state.map.rows[y].length; x += 1) {
        ctx.fillStyle =
          state.map.rows[y][x] === '#'
            ? color(colors.wall, '#1b3324')
            : color(colors.floor, '#2f5d3a');
        ctx.fillRect(x * size, y * size, size, size);
      }
    }
  }

  function drawActor(actor, spriteName, fallback, scale = 1) {
    const image = images[spriteName];
    if (image) {
      const size = 32 * scale;
      ctx.drawImage(image, actor.x - size / 2, actor.y - size / 2, size, size);
    } else {
      ctx.fillStyle = fallback;
      const size = 24 * scale;
      ctx.fillRect(actor.x - size / 2, actor.y - size / 2, size, size);
    }
  }

  function draw() {
    resizeCanvas();
    drawMap();
    drawActor(state.player, 'player', '#2ec4f1');
    drawActor(state.enemy, state.enemy.kind === 'boss' ? 'boss' : 'enemy', '#ef5350', state.enemy.scale);

    ctx.fillStyle = '#ffffff';
    ctx.font = '16px monospace';
    const quests = state.quests
      .map((quest) => `${quest.title} ${Math.min(quest.progress, quest.count)}/${quest.count}`)
      .join(' · ');
    ctx.fillText(
      `Level ${state.levelIndex + 1}/${state.levels.length}  HP ${Math.max(0, state.player.hp)}  Enemy ${Math.max(0, state.enemy.hp)}  Items ${state.inventory}`,
      16,
      28,
    );
    if (quests) ctx.fillText(quests, 16, 50);
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

  function input() {
    return {
      left: keys.has('a') || keys.has('arrowleft'),
      right: keys.has('d') || keys.has('arrowright'),
      up: keys.has('w') || keys.has('arrowup'),
      down: keys.has('s') || keys.has('arrowdown'),
      attack: keys.has('j') || keys.has(' '),
    };
  }

  requestAnimationFrame(frame);
} catch (error) {
  status.textContent = `Failed to load: ${error.message}`;
  console.error(error);
}

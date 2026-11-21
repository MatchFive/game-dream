import { ARENA, PLAYER_RADIUS, TOTAL_WAVES, createSim, step } from './sim.mjs';
import { DEFAULT_MUSIC_VOLUME, clampMusicVolume, findBgmTrack } from './audio.mjs';

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
const musicInput = document.querySelector('#music');
let bgm;
let musicVolume = DEFAULT_MUSIC_VOLUME;

async function loadBgm() {
  try {
    const response = await fetch(
      new URL('./game/build-assets/manifest.json', import.meta.url),
      { cache: 'no-store' },
    );
    if (!response.ok) return;
    const track = findBgmTrack(await response.json());
    if (!track) return;
    bgm = new Audio(new URL(track.file, import.meta.url).href);
    bgm.loop = true;
    bgm.volume = musicVolume;
  } catch {
    // A template without a staged BGM keeps the silent fallback.
  }
}

function playBgm() {
  if (bgm) void bgm.play().catch(() => {});
}

if (musicInput) {
  musicInput.value = String(musicVolume);
  musicInput.addEventListener('input', () => {
    musicVolume = clampMusicVolume(musicInput.value);
    if (bgm) bgm.volume = musicVolume;
  });
}
window.addEventListener('pointerdown', playBgm, { once: true });
window.addEventListener('keydown', playBgm, { once: true });
void loadBgm();
window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  keys.add(key);
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
    event.preventDefault();
  }
  if (key === 'r' && state.finished) state = createSim();
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

function draw() {
  ctx.fillStyle = '#071018';
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  ctx.strokeStyle = '#243d55';
  ctx.lineWidth = 1;
  for (let x = 30; x < ARENA.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 30);
    ctx.lineTo(x, ARENA.height - 30);
    ctx.stroke();
  }
  for (let y = 30; y < ARENA.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(ARENA.width - 30, y);
    ctx.stroke();
  }
  for (const bullet of state.bullets) {
    ctx.fillStyle = '#ffd85e';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const enemy of state.enemies) {
    ctx.fillStyle = '#f04464';
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd0d7';
    ctx.beginPath();
    ctx.arc(enemy.x - 4, enemy.y - 3, 2.5, 0, Math.PI * 2);
    ctx.arc(enemy.x + 4, enemy.y - 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#55d6ff';
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#e8f5ee';
  ctx.font = '16px ui-monospace, monospace';
  ctx.fillText('NEON DRIFT', 20, 24);
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillStyle = '#a9c7df';
  ctx.fillText(
    `Wave ${state.wave}/${TOTAL_WAVES}   Kills ${state.kills}   HP ${Math.max(0, Math.ceil(state.player.hp))}   WASD move`,
    20,
    46,
  );
  if (state.finished) {
    ctx.fillStyle = 'rgb(5 10 16 / 82%)';
    ctx.fillRect(250, 210, 460, 120);
    ctx.fillStyle = '#e8f5ee';
    ctx.font = '28px ui-monospace, monospace';
    ctx.fillText(state.finished === 'win' ? 'SECTOR CLEAR' : 'SIGNAL LOST', 340, 265);
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

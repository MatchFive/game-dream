import { ARENA, GOAL, PLAYER, createSim, platforms, step } from './sim.mjs';
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
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
    event.preventDefault();
  }
  if (key === 'r' && state.finished) state = createSim();
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

function draw() {
  ctx.fillStyle = '#0c1420';
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  ctx.fillStyle = '#14293a';
  for (let x = 0; x < ARENA.width; x += 48) {
    for (let y = 0; y < ARENA.height; y += 48) {
      if ((x / 48 + y / 48) % 2 === 0) ctx.fillRect(x, y, 48, 48);
    }
  }
  for (const platform of platforms) {
    ctx.fillStyle = platform.h > 30 ? '#2f5d3a' : '#3c6b8a';
    ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
    ctx.fillStyle = platform.h > 30 ? '#4ade80' : '#7dd3fc';
    ctx.fillRect(platform.x, platform.y, platform.w, 4);
  }
  for (const coin of state.coins) {
    if (coin.taken) continue;
    ctx.fillStyle = '#ffd85e';
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9a6b00';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = '#e8f5ee';
  ctx.fillRect(GOAL.x, GOAL.y, 8, 62);
  ctx.fillStyle = '#f472b6';
  ctx.beginPath();
  ctx.moveTo(GOAL.x + 8, GOAL.y + 4);
  ctx.lineTo(GOAL.x + 58, GOAL.y + 18);
  ctx.lineTo(GOAL.x + 8, GOAL.y + 34);
  ctx.closePath();
  ctx.fill();

  const player = state.player;
  ctx.fillStyle = '#55d6ff';
  ctx.fillRect(player.x, player.y, PLAYER.width, PLAYER.height);
  ctx.fillStyle = '#0b2533';
  ctx.fillRect(player.x + 6, player.y + 9, 5, 5);
  ctx.fillRect(player.x + 17, player.y + 9, 5, 5);
  ctx.fillRect(player.x + 7, player.y + 27, 14, 4);

  ctx.fillStyle = '#e8f5ee';
  ctx.font = '16px ui-monospace, monospace';
  ctx.fillText('SKYLINE RUNNER', 20, 24);
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillStyle = '#a9c7df';
  ctx.fillText(
    `Coins ${state.collected}/${state.coins.length}   Time ${state.time.toFixed(1)}   Reach the flag`,
    20,
    46,
  );
  if (state.finished) {
    ctx.fillStyle = 'rgb(5 10 16 / 82%)';
    ctx.fillRect(250, 210, 460, 120);
    ctx.fillStyle = '#e8f5ee';
    ctx.font = '28px ui-monospace, monospace';
    ctx.fillText(state.finished === 'win' ? 'COURSE CLEAR' : 'FELL', 360, 265);
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
        jump: keys.has('w') || keys.has('arrowup') || keys.has(' '),
      },
      1 / 60,
    );
    accumulator -= 1 / 60;
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

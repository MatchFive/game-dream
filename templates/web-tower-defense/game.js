import { ARENA, PATH, TOTAL_WAVES, createSim, step } from './sim.mjs';
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
  if (event.key.toLowerCase() === 'r' && state.finished) state = createSim();
});

function draw() {
  ctx.fillStyle = '#071018';
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  ctx.strokeStyle = '#8d744c';
  ctx.lineWidth = 38;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(PATH[0].x, PATH[0].y);
  for (const point of PATH.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.strokeStyle = '#c6a96b';
  ctx.lineWidth = 26;
  ctx.stroke();
  for (const tower of state.towers) {
    ctx.fillStyle = tower.level > 0 ? '#55d6ff' : '#34475c';
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, 18, 0, Math.PI * 2);
    ctx.fill();
    if (tower.level > 0) {
      ctx.fillStyle = '#ffd85e';
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, 7 + tower.level * 2, 0, Math.PI * 2);
      ctx.fill();
    }
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
    ctx.arc(enemy.x, enemy.y, 13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e8f5ee';
  ctx.font = '16px ui-monospace, monospace';
  ctx.fillText('GRIDLOCK', 20, 24);
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillStyle = '#a9c7df';
  ctx.fillText(
    `Wave ${state.wave}/${TOTAL_WAVES}   Gold ${state.gold}   Base ${Math.max(0, state.baseHp)}   auto-defense`,
    20,
    46,
  );
  if (state.finished) {
    ctx.fillStyle = 'rgb(5 10 16 / 82%)';
    ctx.fillRect(250, 210, 460, 120);
    ctx.fillStyle = '#e8f5ee';
    ctx.font = '28px ui-monospace, monospace';
    ctx.fillText(state.finished === 'win' ? 'GRID HELD' : 'BASE LOST', 365, 265);
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
    step(state, { auto: true }, 1 / 60);
    accumulator -= 1 / 60;
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

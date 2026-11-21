import { ARENA, RUN_SECONDS, createSim, step } from './sim.mjs';
import { DEFAULT_MUSIC_VOLUME, clampMusicVolume, findBgmTrack } from './audio.mjs';
import { findPlayerBinding } from './bindings.mjs';
import { atlasFrameRect, findAnimationEntry, frameAtTime } from './animation.mjs';

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
let playerAnimation;
let playerSprite;

async function loadPlayerSprite() {
  try {
    const response = await fetch(
      new URL('./game/build-assets/bindings.json', import.meta.url),
      { cache: 'no-store' },
    );
    if (!response.ok) return;
    const binding = findPlayerBinding(await response.json());
    if (!binding) return;
    const image = new Image();
    image.src = new URL(binding.file, import.meta.url).href;
    await image.decode();
    playerSprite = image;
  } catch {
    // The vector player remains when no sprite is bound.
  }
}

async function loadPlayerAnimation() {
  try {
    const indexResponse = await fetch(
      new URL('./game/build-assets/animations/index.json', import.meta.url),
      { cache: 'no-store' },
    );
    if (!indexResponse.ok) return;
    const entry = findAnimationEntry(await indexResponse.json());
    if (!entry) return;
    const image = new Image();
    image.src = new URL(entry.image, import.meta.url).href;
    await image.decode();
    playerAnimation = { ...entry, image };
  } catch {
    // The template falls back to the vector ship when no atlas is staged.
  }
}

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
void loadPlayerAnimation();
void loadPlayerSprite();

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
  ctx.fillStyle = '#071018';
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  ctx.strokeStyle = '#29465d';
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, 900, 480);
  ctx.fillStyle = '#6d94b3';
  for (let x = 60; x < 930; x += 60) ctx.fillRect(x, 60, 1, 430);
  for (let y = 60; y < 510; y += 60) ctx.fillRect(30, y, 900, 1);

  for (const bullet of state.bullets) {
    ctx.fillStyle = '#ffd85e';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const enemy of state.enemies) {
    ctx.fillStyle = '#e05a61';
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd2c2';
    ctx.beginPath();
    ctx.arc(enemy.x - 4, enemy.y - 3, 2.5, 0, Math.PI * 2);
    ctx.arc(enemy.x + 4, enemy.y - 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (playerAnimation) {
    const frame = frameAtTime(playerAnimation, state.time);
    const rect = atlasFrameRect(playerAnimation, frame);
    ctx.drawImage(
      playerAnimation.image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      state.player.x - rect.width / 2,
      state.player.y - rect.height / 2,
      rect.width,
      rect.height,
    );
  } else if (playerSprite) {
    ctx.drawImage(playerSprite, state.player.x - 28, state.player.y - 28, 56, 56);
  } else {
    ctx.fillStyle = '#55d6ff';
    ctx.beginPath();
    ctx.moveTo(state.player.x, state.player.y - 20);
    ctx.lineTo(state.player.x + 16, state.player.y + 14);
    ctx.lineTo(state.player.x, state.player.y + 8);
    ctx.lineTo(state.player.x - 16, state.player.y + 14);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#e8f5ee';
  ctx.font = '16px ui-monospace, monospace';
  ctx.fillText('EMBER SURVIVOR', 20, 24);
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillStyle = '#a9c7df';
  ctx.fillText(
    `Time ${Math.min(state.time, RUN_SECONDS).toFixed(1)}/${RUN_SECONDS}   Lv ${state.level}   HP ${Math.max(0, Math.ceil(state.player.hp))}   Kills ${state.kills}`,
    20,
    46,
  );
  if (state.finished) {
    ctx.fillStyle = 'rgb(5 10 16 / 82%)';
    ctx.fillRect(250, 210, 460, 120);
    ctx.fillStyle = '#e8f5ee';
    ctx.font = '28px ui-monospace, monospace';
    ctx.fillText(state.finished === 'win' ? 'SURVIVED' : 'DEFEATED', 370, 265);
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

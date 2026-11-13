import { createSim, step } from './sim.mjs';
import {
  clearSave,
  loadState,
  resetState,
  saveKeyFor,
  snapshot,
  writeSave,
} from './save.mjs';
import { readSettings, writeSettings } from './settings.mjs';

const status = document.querySelector('#status');
const questLine = document.querySelector('#quests-line');
const inventoryPanel = document.querySelector('#inventory');
const questsPanel = document.querySelector('#quests');
const settingsPanel = document.querySelector('#settings');
const pausePanel = document.querySelector('#pause');
const inventoryList = document.querySelector('#inventory-list');
const questList = document.querySelector('#quest-list');
const musicInput = document.querySelector('#music');
const sfxInput = document.querySelector('#sfx');
const fullscreenInput = document.querySelector('#fullscreen');
window.addEventListener('error', (event) => {
  status.textContent = `Error: ${event.message}`;
});

const storage = {
  getItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  removeItem(key) {
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
};

let settings = readSettings(storage);

const audio = {
  ctx: null,
  musicGain: null,
  sfxGain: null,
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume?.();
      return;
    }
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      this.ctx = new AudioContext();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.ctx.destination);
      this.sfxGain.connect(this.ctx.destination);
      const drone = this.ctx.createOscillator();
      drone.type = 'sine';
      drone.frequency.value = 110;
      drone.connect(this.musicGain);
      drone.start();
      this.ctx.resume?.();
      this.apply();
    } catch {
      this.ctx = null;
    }
  },
  apply() {
    if (!this.ctx) return;
    this.musicGain.gain.value = settings.music * 0.05;
    this.sfxGain.gain.value = settings.sfx * 0.25;
  },
  play(name) {
    if (!this.ctx || settings.sfx <= 0) return;
    try {
      this.playTone(name);
    } catch {
      // Audio is optional and must never block gameplay.
    }
  },
  playTone(name) {
    const tones = {
      attack: [220, 0.05],
      hit: [90, 0.08],
      level: [440, 0.15],
      win: [660, 0.3],
      lose: [110, 0.4],
      reset: [300, 0.1],
    };
    const [frequency, duration] = tones[name] ?? tones.hit;
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.sfxGain);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  },
};

function renderList(list, entries, empty) {
  list.replaceChildren();
  const values = entries.length > 0 ? entries : [empty];
  for (const entry of values) {
    const item = document.createElement('li');
    item.textContent = entry;
    list.appendChild(item);
  }
}

function color(value, fallback) {
  const hex = String(value ?? '').replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(hex) ? Number.parseInt(hex, 16) : fallback;
}

try {
  const config = await fetch('./game.json').then((response) => response.json());
  const state = createSim(config);
  const saveKey = saveKeyFor(config);
  const restored = loadState(storage, saveKey, state);
  let lastSave = restored ? JSON.stringify(snapshot(state)) : '';
  let saveWarning = false;
  let paused = false;
  let lastFocus = null;
  let restartArmed = false;
  let restartTimer = 0;
  const touch = { left: false, right: false, up: false, down: false, attack: false };
  const pointers = new Map();
  const holdButtons = new Map();
  const panelOpen = () =>
    [inventoryPanel, questsPanel, settingsPanel].some(
      (panel) => !panel.classList.contains('hidden'),
    );

  function setTouch(control, value) {
    touch[control] = value;
    holdButtons.get(control)?.classList.toggle('active', value);
  }

  function releasePointer(pointerId) {
    for (const [control, ids] of pointers) {
      if (ids.delete(pointerId)) setTouch(control, ids.size > 0);
    }
  }

  function resetTouch() {
    for (const [control, ids] of pointers) {
      ids.clear();
      setTouch(control, false);
    }
  }

  function disarmRestart() {
    restartArmed = false;
    const button = document.querySelector('#pause-restart');
    if (button) button.textContent = 'Restart';
    clearTimeout(restartTimer);
  }

  function setPaused(value) {
    paused = value;
    disarmRestart();
    pausePanel.classList.toggle('hidden', !value);
    document.body.classList.toggle('paused', value);
    for (const panel of [inventoryPanel, questsPanel, settingsPanel]) panel.inert = value;
    const gameRoot = document.querySelector('#game');
    if (gameRoot) gameRoot.inert = value;
    if (value) {
      resetTouch();
      lastFocus = document.activeElement;
      document.querySelector('#resume')?.focus();
    } else if (lastFocus instanceof HTMLElement) {
      lastFocus.focus();
      lastFocus = null;
    }
  }

  function resetGame() {
    setPaused(false);
    resetState(state);
    clearSave(storage, saveKey);
    lastSave = '';
    saveWarning = false;
    audio.play('reset');
  }

  function worldSize() {
    return {
      width: state.map
        ? state.map.rows[0].length * state.map.tile_size
        : config.arena.width,
      height: state.map
        ? state.map.rows.length * state.map.tile_size
        : config.arena.height,
    };
  }
  const initialSize = worldSize();
  const width = initialSize.width;
  const height = initialSize.height;

  function applySettings() {
    settings.fullscreen = Boolean(document.fullscreenElement);
    settings = writeSettings(storage, settings);
    musicInput.value = String(settings.music);
    sfxInput.value = String(settings.sfx);
    fullscreenInput.checked = settings.fullscreen;
    audio.apply();
  }

  function saveProgress() {
    if (state.finished) {
      if (lastSave) {
        clearSave(storage, saveKey);
        lastSave = '';
      }
      return;
    }
    const signature = JSON.stringify(snapshot(state));
    if (signature === lastSave) return;
    if (writeSave(storage, saveKey, state)) {
      lastSave = signature;
      saveWarning = false;
    } else {
      saveWarning = true;
    }
  }

  document.addEventListener('fullscreenchange', () => {
    settings.fullscreen = Boolean(document.fullscreenElement);
    fullscreenInput.checked = settings.fullscreen;
    writeSettings(storage, settings);
  });

  applySettings();

  window.addEventListener('pointerdown', () => audio.init());
  window.addEventListener('pointerup', (event) => releasePointer(event.pointerId));
  window.addEventListener('pointercancel', (event) => releasePointer(event.pointerId));
  window.addEventListener('blur', resetTouch);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) resetTouch();
  });
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    const inPanel =
      event.target instanceof Element &&
      Boolean(event.target.closest('#inventory, #quests, #settings, #pause'));
    audio.init();
    if (inPanel && key !== 'escape') return;
    if (!event.repeat && key === 'i') inventoryPanel.classList.toggle('hidden');
    if (!event.repeat && key === 'q') questsPanel.classList.toggle('hidden');
    if (!event.repeat && key === 'o') settingsPanel.classList.toggle('hidden');
    if (!event.repeat && key === 'p') setPaused(!paused);
    if (!event.repeat && key === 'r') resetGame();
    if (key === 'escape') {
      if (!pausePanel.classList.contains('hidden')) setPaused(false);
      inventoryPanel.classList.add('hidden');
      questsPanel.classList.add('hidden');
      settingsPanel.classList.add('hidden');
    }
    if (
      document.activeElement instanceof Element &&
      document.activeElement.closest('.panel') &&
      (inventoryPanel.classList.contains('hidden') &&
        questsPanel.classList.contains('hidden') &&
        settingsPanel.classList.contains('hidden'))
    ) {
      document.activeElement.blur();
    }
    if (key === 'j' || key === ' ') audio.play('attack');
  });

  for (const button of document.querySelectorAll('[data-hold]')) {
    const control = button.dataset.hold;
    holdButtons.set(control, button);
    button.addEventListener('pointerdown', (event) => {
      if (paused) return;
      event.preventDefault();
      audio.init();
      button.setPointerCapture?.(event.pointerId);
      if (!pointers.has(control)) pointers.set(control, new Set());
      pointers.get(control).add(event.pointerId);
      setTouch(control, true);
      if (control === 'attack') audio.play('attack');
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      button.addEventListener(type, (event) => {
        const ids = pointers.get(control);
        if (!ids) return;
        ids.delete(event.pointerId);
        setTouch(control, ids.size > 0);
      });
    }
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  }
  for (const button of document.querySelectorAll('[data-panel]')) {
    button.addEventListener('click', () => {
      if (paused) return;
      const panel = button.dataset.panel;
      if (panel === 'pause') {
        setPaused(true);
      } else if (panel === 'inventory') {
        inventoryPanel.classList.toggle('hidden');
      } else if (panel === 'quests') {
        questsPanel.classList.toggle('hidden');
      } else if (panel === 'settings') {
        settingsPanel.classList.toggle('hidden');
      }
    });
  }
  document.querySelector('#resume').addEventListener('click', () => setPaused(false));
  document.querySelector('#pause-restart').addEventListener('click', () => {
    if (!restartArmed) {
      restartArmed = true;
      const button = document.querySelector('#pause-restart');
      if (button) button.textContent = 'Confirm restart';
      clearTimeout(restartTimer);
      restartTimer = setTimeout(disarmRestart, 3000);
      return;
    }
    disarmRestart();
    setPaused(false);
    resetGame();
  });
  document.querySelector('#pause-settings').addEventListener('click', () => {
    setPaused(false);
    settingsPanel.classList.remove('hidden');
  });

  musicInput.addEventListener('input', () => {
    settings.music = Number(musicInput.value);
    applySettings();
  });
  sfxInput.addEventListener('input', () => {
    settings.sfx = Number(sfxInput.value);
    applySettings();
  });
  fullscreenInput.addEventListener('change', async () => {
    const wanted = fullscreenInput.checked;
    try {
      if (wanted) await document.documentElement.requestFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      fullscreenInput.checked = false;
    }
    applySettings();
  });

  class GameScene extends Phaser.Scene {
    constructor() {
      super('game');
      this.accumulator = 0;
      this.renderedLevel = -1;
    }

    preload() {
      for (const [name, path] of Object.entries(config.sprites ?? {})) {
        if (path) this.load.image(name, path);
      }
    }

    create() {
      this.graphics = this.add.graphics();
      this.cursors = this.input.keyboard.addKeys({
        left: Phaser.Input.Keyboard.KeyCodes.LEFT,
        right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        up: Phaser.Input.Keyboard.KeyCodes.UP,
        down: Phaser.Input.Keyboard.KeyCodes.DOWN,
        a: Phaser.Input.Keyboard.KeyCodes.A,
        d: Phaser.Input.Keyboard.KeyCodes.D,
        w: Phaser.Input.Keyboard.KeyCodes.W,
        s: Phaser.Input.Keyboard.KeyCodes.S,
        j: Phaser.Input.Keyboard.KeyCodes.J,
        space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      });
      this.drawMap();
      this.ensureActors();
    }

    drawMap() {
      const graphics = this.graphics;
      graphics.clear();
      if (!state.map) {
        graphics.fillStyle(0x1b3324, 1).fillRect(0, 0, this.scale.width, this.scale.height);
        this.renderedLevel = state.levelIndex;
        return;
      }
      const size = state.map.tile_size;
      const colors = state.map.tileset ?? { floor: '2f5d3a', wall: '1b3324' };
      for (let y = 0; y < state.map.rows.length; y += 1) {
        for (let x = 0; x < state.map.rows[y].length; x += 1) {
          const wall = state.map.rows[y][x] === '#';
          graphics
            .fillStyle(color(wall ? colors.wall : colors.floor, wall ? 0x1b3324 : 0x2f5d3a), 1)
            .fillRect(x * size, y * size, size, size);
        }
      }
      this.renderedLevel = state.levelIndex;
    }

    createActor(spriteName, actor, fallback, scale) {
      if (this.textures.exists(spriteName)) {
        const image = this.add.image(actor.x, actor.y, spriteName);
        image.setDisplaySize(32 * scale, 32 * scale);
        image.setDepth(2);
        return image;
      }
      return this.add
        .rectangle(actor.x, actor.y, 24 * scale, 24 * scale, fallback)
        .setDepth(2);
    }

    ensureActors() {
      this.playerActor?.destroy();
      this.enemyActor?.destroy();
      this.playerActor = this.createActor('player', state.player, 0x2ec4f1, 1);
      this.enemyActor = this.createActor(
        state.enemy.kind === 'boss' ? 'boss' : 'enemy',
        state.enemy,
        0xef5350,
        state.enemy.scale,
      );
    }

    update(_time, delta) {
      if (paused) {
        this.updateHud();
        return;
      }
      this.accumulator += Math.min(0.25, delta / 1000);
      const beforeHp = state.enemy.hp;
      const beforeLevel = state.levelIndex;
      const wasFinished = state.finished;
      const blocked =
        panelOpen() ||
        (document.activeElement instanceof Element &&
          Boolean(document.activeElement.closest('#inventory, #quests, #settings')));
      let steps = 0;
      while (this.accumulator >= 1 / 60 && steps < 5) {
        step(
          state,
          {
            left: !blocked && (this.cursors.left.isDown || this.cursors.a.isDown || touch.left),
            right: !blocked && (this.cursors.right.isDown || this.cursors.d.isDown || touch.right),
            up: !blocked && (this.cursors.up.isDown || this.cursors.w.isDown || touch.up),
            down: !blocked && (this.cursors.down.isDown || this.cursors.s.isDown || touch.down),
            attack: !blocked && (this.cursors.j.isDown || this.cursors.space.isDown || touch.attack),
          },
          1 / 60,
        );
        this.accumulator -= 1 / 60;
        steps += 1;
      }
      saveProgress();
      if (state.levelIndex === beforeLevel && state.enemy.hp < beforeHp) audio.play('hit');
      if (state.levelIndex !== beforeLevel) audio.play('level');
      if (state.finished && !wasFinished) audio.play(state.finished === 'win' ? 'win' : 'lose');
      if (this.renderedLevel !== state.levelIndex) {
        const size = worldSize();
        if (size.width !== this.scale.width || size.height !== this.scale.height) {
          this.scale.resize(size.width, size.height);
        }
        this.drawMap();
        this.ensureActors();
      }
      this.playerActor.setPosition(state.player.x, state.player.y);
      this.enemyActor.setPosition(state.enemy.x, state.enemy.y);
      this.updateHud();
    }

    updateHud() {
      const items = Object.values(state.inventory).reduce((total, count) => total + count, 0);
      renderList(
        inventoryList,
        Object.entries(state.inventory).map(([name, count]) => `${name} × ${count}`),
        'Empty',
      );
      const questEntries = state.quests.map(
        (quest) =>
          `${quest.title} ${Math.min(quest.progress, quest.count)}/${quest.count}${quest.completed ? ' ✓' : ''}`,
      );
      renderList(questList, questEntries, 'No quests');
      questLine.textContent = questEntries.join(' · ');
      const warning = saveWarning ? ' · save unavailable' : '';
      status.textContent =
        state.finished === 'win'
          ? `Victory · Level ${state.levelIndex + 1}/${state.levels.length} · Items ${items}${warning}`
          : state.finished === 'lose'
            ? `Defeat · R restart${warning}`
            : `Level ${state.levelIndex + 1}/${state.levels.length} · HP ${Math.max(0, state.player.hp)} · Enemy ${Math.max(0, state.enemy.hp)} · Items ${items} · WASD/J · O settings · R reset${warning}`;
    }
  }

  new Phaser.Game({
    type: Phaser.CANVAS,
    parent: 'game',
    width,
    height,
    backgroundColor: '#1b3324',
    pixelArt: true,
    scene: GameScene,
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH },
  });
} catch (error) {
  status.textContent = `Failed to load: ${error.message}`;
  console.error(error);
}

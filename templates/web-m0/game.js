import { createSim, step } from './sim.mjs';

const status = document.querySelector('#status');
const inventoryPanel = document.querySelector('#inventory');
const questsPanel = document.querySelector('#quests');
const inventoryList = document.querySelector('#inventory-list');
const questList = document.querySelector('#quest-list');
window.addEventListener('error', (event) => {
  status.textContent = `Error: ${event.message}`;
});

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
  const width = state.map
    ? state.map.rows[0].length * state.map.tile_size
    : config.arena.width;
  const height = state.map
    ? state.map.rows.length * state.map.tile_size
    : config.arena.height;

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key === 'i') inventoryPanel.classList.toggle('hidden');
    if (key === 'q') questsPanel.classList.toggle('hidden');
    if (key === 'escape') {
      inventoryPanel.classList.add('hidden');
      questsPanel.classList.add('hidden');
    }
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
        graphics.fillStyle(0x1b3324, 1).fillRect(0, 0, width, height);
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
      this.accumulator += Math.min(0.25, delta / 1000);
      let steps = 0;
      while (this.accumulator >= 1 / 60 && steps < 5) {
        step(
          state,
          {
            left: this.cursors.left.isDown || this.cursors.a.isDown,
            right: this.cursors.right.isDown || this.cursors.d.isDown,
            up: this.cursors.up.isDown || this.cursors.w.isDown,
            down: this.cursors.down.isDown || this.cursors.s.isDown,
            attack: this.cursors.j.isDown || this.cursors.space.isDown,
          },
          1 / 60,
        );
        this.accumulator -= 1 / 60;
        steps += 1;
      }
      if (this.renderedLevel !== state.levelIndex) {
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
      renderList(
        questList,
        state.quests.map(
          (quest) =>
            `${quest.title} ${Math.min(quest.progress, quest.count)}/${quest.count}${quest.completed ? ' ✓' : ''}`,
        ),
        'No quests',
      );
      status.textContent =
        state.finished === 'win'
          ? `Victory · Level ${state.levelIndex + 1}/${state.levels.length} · Items ${items}`
          : state.finished === 'lose'
            ? 'Defeat'
            : `Level ${state.levelIndex + 1}/${state.levels.length} · HP ${Math.max(0, state.player.hp)} · Enemy ${Math.max(0, state.enemy.hp)} · Items ${items} · WASD/J`;
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

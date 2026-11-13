# GameDream Web M1 Content Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Bring shared M1 content into the Web M0 runtime: campaign levels, map rows/colors, quests, enemy stats, inventory count, and sprite assets. The browser renders maps/sprites/HUD; the headless sim clears the campaign and prints `WEB_MAP_OK` / `WEB_QUEST_COMPLETE` / `WEB_WIN`.

**Architecture:** `composeWebProject` gains optional `contentDir`/`modulesDir`; it embeds levels (campaign + maps), quests, sprites, and copies SVG assets into `assets/`. `sim.mjs` is level-aware (map, enemy, quests, inventory, heal-on-level); `game.js` draws map tiles, sprites, HUD, and the same sim. Default M0 behavior remains a single arena.

**Tech Stack:** Existing Web Canvas/ESM package; no new dependencies.

## Global Constraints

- No Godot changes; Godot content stays the source of truth for web embedding.
- `--content templates/rpg-action-m1/content` yields 3 levels, 2 quests, player/enemy/boss sprites.
- Maps render from embedded rows/colors; walls are visual (collision parity deferred).
- Quests progress on kill; inventory count increments per enemy.
- Verify requires `WEB_MAP_OK` when levels exist and `WEB_QUEST_COMPLETE` when quests exist.
- Generated assets are relative `assets/*.svg`; browser falls back to rects if not loaded.

## Review Focus

1. Content embedding fidelity (levels/maps/quests/enemy stats).
2. Sim level transitions, quests, inventory, termination.
3. Browser render map/sprite/HUD parity without DOM dependence in sim.
4. Verify markers driven by config; M0 default unchanged.
5. Asset copy path safety and no Godot regressions.

---

### Task 1: Web content embedding

- Files: `packages/web/src/compose.ts`, `packages/web/src/types.ts` (if needed), CLI `--content/--modules`.
- Test: content compose levels/quests/assets; default M0 unchanged.
- Implement: read campaign/maps/quests/sprites; copy SVGs; embed config.
- Commit.

### Task 2: Level-aware sim + renderer

- Files: `templates/web-m0/sim.mjs`, `sim-run.mjs`, `game.js`, `README.md`.
- Test: content sim prints MAP/QUEST/WIN; M0 still BOOT/WIN; quest/inventory.
- Implement: level state, map/enemy loading, kill quests, inventory, sprite draw.
- Commit.

### Task 3: Verify markers + docs + full verification

- Files: `packages/web/src/verify.ts`, tests, README.
- Test: markers conditional on config; full suite/typecheck/build.
- Commit.

## Self-Review

- Content mapping, level transition, quests/inventory, markers, assets, M0 compatibility.
- Deferred: wall collision, Tiled data in web, Phaser.

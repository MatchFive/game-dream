# GameDream Phaser Renderer Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Replace the generated Web Canvas 2D renderer with Phaser 3 while keeping the pure `sim.mjs` contract, HTML panels, headless markers, and browser screenshot gate. Generated projects vendor `phaser.min.js` so they remain standalone.

**Architecture:** `@gamedream/web` depends on `phaser@3.90.0`; compose copies `vendor/phaser.min.js` into each project. `game.js` becomes a Phaser Scene that renders map tiles, player/enemy sprites, HUD, and panels from the existing sim state. `sim.mjs` is unchanged and still drives headless verification.

**Tech Stack:** Phaser 3 UMD, existing Canvas-independent sim, CDP screenshot.

## Global Constraints

- `sim.mjs` and `sim-run.mjs` stay pure Node-compatible; no Phaser imports.
- Generated projects include `vendor/phaser.min.js`; `WEB_PROJECT_FILES` and verify require it.
- Sprite SVGs load through Phaser; fallback rectangles if textures fail.
- Map tiles redraw on level change; HUD/panels read sim state.
- M0 and M1 markers/screenshots must still pass; no Godot changes.
- `dream web compose` copies vendor from the installed package; no network at compose time.

## Review Focus

1. Phaser boot and scene lifecycle vs sim time/level transitions.
2. Sprite fallback and asset paths.
3. Vendor path resolution/copy safety and verify contract.
4. HUD/panels parity; screenshot gate.
5. Headless M0/M1 unchanged; generated standalone.

---

### Task 1: Vendor Phaser + template

- Files: `packages/web/package.json`, `packages/web/src/compose.ts`, `templates/web-m0/index.html`, `style.css`.
- Test: compose includes vendor; index loads Phaser before module.
- Commit.

### Task 2: Phaser scene renderer

- Files: `templates/web-m0/game.js`, `README.md`.
- Test: real screenshot M0/M1; panels; markers.
- Commit.

### Task 3: Docs/tests/full verification

- Files: tests, README.
- Test: full suite/typecheck/build; real browser screenshot; review.
- Commit.

## Self-Review

- Vendor, scene, sim, sprites, map, HUD/panels, screenshot, M0/M1, Godot.
- Deferred: Phaser physics, asset atlases, Web save.

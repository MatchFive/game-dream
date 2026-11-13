# GameDream Web Collision + UI Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Make the Web M1 slice feel like a game: player/enemy collide with map walls, kills add inventory items, and browser panels show inventory/quests. Keep headless verification and M0 behavior.

**Architecture:** `sim.mjs` adds grid wall queries and axis-separated movement; inventory becomes a name→count map; quests drive a panel. `index.html`/`game.js` add I/Q panels and HUD total. `throne.json` removes the center pillar that would block the deterministic autoplay path.

**Tech Stack:** Existing Web Canvas/ESM; no dependencies.

## Global Constraints

- Walls are map tiles (`#`); outside bounds are walls.
- Player/enemy use a 12px half-extent; movement resolves X then Y.
- Headless autoplay must still clear the 3-level campaign.
- Inventory gains `Slime Gel` / `Boss Core` per kill; quests show progress.
- I toggles inventory; Q toggles quests; Esc closes panels.
- M0 single arena has no map collision and still `WEB_BOOT_OK`/`WEB_WIN`.
- Godot content/runtime unchanged except the throne map pillar removal.

## Review Focus

1. Collision correctness, spawn safety, no tunneling through border.
2. Autoplay still clears M1 within 900 frames.
3. Inventory/quest state and panels; no DOM in sim.
4. M0/no-map fallback.
5. Map content change does not break Godot verification.

---

### Task 1: Sim collision + inventory

- Files: `templates/web-m0/sim.mjs`, `sim-run.mjs`, `templates/rpg-action-m1/content/maps/throne.json`.
- Test: sim wall block; inventory/quest after kill; M1 run wins.
- Implement: wall queries, axis movement, inventory map, throne pillar removal.
- Commit.

### Task 2: Browser panels + HUD

- Files: `templates/web-m0/index.html`, `style.css`, `game.js`, `README.md`.
- Test: source tokens; panel toggles; HUD total.
- Implement: panels, key toggles, render inventory/quests.
- Commit.

### Task 3: Tests/docs/full verification

- Files: `packages/web/test/web.test.ts`, README.
- Test: collision, markers, full suite/typecheck/build.
- Commit.

## Self-Review

- Wall collisions/bounds, autoplay, inventory/quests, panels, M0, Godot E2E.
- Deferred: pathfinding, item pickups, real inventory UI art, Phaser.

# GameDream Web Save + Audio Settings Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Complete the Web M1 loop with localStorage save/continue, a settings panel (music/SFX/fullscreen), runtime WebAudio SFX, and reset/restart. Keep `sim.mjs`/`sim-run` deterministic and headless.

**Architecture:** New pure `save.mjs` snapshots/restores sim state and stores in an injectable storage; `settings.mjs` loads/saves clamped volume/fullscreen settings. `game.js` uses them, creates WebAudio buses, plays event SFX, and adds a settings panel. No external audio assets.

**Tech Stack:** Existing Phaser/ESM/HTML; WebAudio; localStorage; no new dependencies.

## Global Constraints

- Headless `sim-run.mjs` never reads localStorage and remains deterministic.
- Save schema versioned; invalid/corrupt saves are ignored and removed.
- Saved data: level index, player HP, inventory, quest progress; enemy respawns on load.
- Settings: music/sfx 0..1, fullscreen bool; persisted; defaults 0.35/0.7.
- `O` toggles settings; `R` resets save/run; `Esc` closes panels.
- Audio only starts after a user gesture; no headless/autoplay requirement.
- M0/M1 markers and screenshots unchanged.

## Review Focus

1. Save validation/versioning, restore level edges, reset, no headless impact.
2. Settings clamping/storage errors; panel/UI wiring.
3. WebAudio lifecycle, gain/mute, no audio errors blocking gameplay.
4. Screenshot/HUD/panels parity; M0/M1.
5. Tests/docs/compose file list.

---

### Task 1: Pure save/settings modules

- Files: `templates/web-m0/save.mjs`, `settings.mjs`, tests.
- Test: snapshot/restore, corrupt save, reset, settings clamp.
- Implement: modules; add to `WEB_PROJECT_FILES`.
- Commit.

### Task 2: Game wiring + UI/audio

- Files: `templates/web-m0/game.js`, `index.html`, `style.css`, `README.md`.
- Test: source/UI; real screenshot.
- Implement: load/save, settings panel, WebAudio events, R reset.
- Commit.

### Task 3: Full verification + review

- Files: tests/docs.
- Run suite/typecheck/build; Edge screenshots; review.
- Commit.

## Self-Review

- Save schema, restore/reset, settings, audio, UI, M0/M1, screenshot, compose/files.
- Deferred: cloud saves, music tracks, pause menu.

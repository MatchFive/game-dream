# Plan 59: Web Shooter Slice

## Goal

Extend Web cross-engine coverage beyond RPG/survivor/platformer with a real
top-down shooter.

## Implemented

- `templates/web-shooter`: standalone Canvas/ESM top-down shooter.
- Shared `sim.mjs`: movement, nearest-enemy auto-fire, bullets, three waves of
  four enemies, HP, win/lose, restart.
- `sim-run.mjs` headless autoplay prints `WEB_BOOT_OK` + `WEB_WIN`.
- Browser HUD and neon grid/arena.
- Compose, verify, screenshot, and focused compose+verify test.

## Evidence

- Real Web verify: `WEB_BOOT_OK`, `WEB_WIN`, exit 0.
- Screenshot: 1280×720, 74 colors.
- Focused CLI test added.

# Plan 49: Survivor Demo Depth

## Goal

Turn the survivor case from a 12-second minimal loop into a demo-sized run:
multiple weapons, upgrade choices, enemy variety, a boss with a phase change,
XP gems, and a 60-second survival goal.

## Run structure

- 60-second run; boss spawns at 40 seconds.
- Crawlers and brutes spawn in escalating pressure; boss is a distinct elite.
- XP gems magnet toward the player and drive level-ups.
- Level-up pauses the run and offers three weapon upgrades.
- Weapons: auto-bolt, close-range aura, and periodic nova.
- Manual choices use `1`/`2`/`3`; headless picks automatically.
- Headless runs at accelerated time scale so G3 still fits the fixed frame cap.

## Markers

- `GAMEDREAM_SURVIVOR_SPAWN`
- `GAMEDREAM_SURVIVOR_LEVEL`
- `GAMEDREAM_UPGRADE`
- `GAMEDREAM_BOSS`
- `GAMEDREAM_BOSS_PHASE`
- `GAMEDREAM_WIN`

## Evidence

- Real Godot: G1/G2/G3 pass, G6 pass (1280×720, 27 colors).
- Benchmark remains 7 playable / 0 fallback / 0 failed, exit 0.
- The HUD shows time, HP/XP bars, level, kills, and weapon levels.

## Limits

- Godot-only; no Web/Unity survivor demo parity.
- Content is still code-driven, not authored through an external content pack.
- No weapon evolution tree, shop/meta progression, or save between runs.

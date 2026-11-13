# Plan 47: Shooter Wave Depth

## Goal

Align the shooter slice with its benchmark prompt, which asks for enemy waves.
The previous implementation spawned one static group of five enemies.

## Changes

- Three waves, four enemies per wave.
- `GAMEDREAM_WAVE` marker on each wave start.
- Kill/win markers now reflect cumulative wave progress.
- HUD shows wave number and cumulative kills.
- Existing top-down movement, nearest-enemy fire, enemy chase, and HP retained.

## Evidence

- Real Godot: G1/G2/G3 pass, G6 pass (1280×720, 25 colors).
- Markers observed: `GAMEDREAM_KILL`, `GAMEDREAM_WAVE`, `GAMEDREAM_WIN`.
- Benchmark remains 6 playable / 0 fallback / 0 failed; exit 0.
- Behavior change is isolated to `system.shooter`.

## Limits

- Three waves, not an endless wave mode.
- Wave composition is fixed; no difficulty scaling or upgrades.

# Plan 45: Playable Tower Defense Slice

## Goal

Move the `tower-defense` benchmark case from `fallback` to `playable` with a
real path, waves, buildable towers, upgrades, and base defense.

## Scope

- Fixed enemy path and a base with HP.
- Three waves of two enemies with increasing HP.
- Build and upgrade towers with gold earned from kills.
- Towers automatically acquire and shoot enemies; projectiles and HP bars.
- HUD and a visible path/arena.
- Headless auto-build/upgrade/wave management for G3.
- Same create/compose/G1/G2/G3/G6 path as other cases.

## Implementation

- `modules/system.tower_defense`: path progression, waves, towers, bullets, draw map.
- `templates/tower-defense`: template manifest selecting the module.
- `fixtures/specs/tower-defense.yaml`: direct compose fixture.
- Updated eval/benchmark expectations and fixture module inventory.

## Evidence

- Real Godot: G1/G2/G3 pass, G6 pass (1280×720, 32 colors).
- Markers observed: `GAMEDREAM_WAVE`, `GAMEDREAM_WIN`.
- Benchmark: `5 playable / 1 fallback / 0 failed`.
- Existing action-rpg, platformer, shooter, roguelike paths unchanged.
- UE remains deferred.

## Limits

- Godot-only slice; Web/Unity tower-defense parity is not claimed.
- Three waves rather than the prompt's 20; tower placement is slot-based.

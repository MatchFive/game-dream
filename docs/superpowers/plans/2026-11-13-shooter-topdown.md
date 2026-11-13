# Plan 43: Playable Top-Down Shooter Slice

## Goal

Move the `shooter` benchmark case from `fallback` to `playable` with a real
`shooter-topdown` Godot template and `system.shooter` module.

## Scope

- Top-down movement with clamped arena bounds.
- Nearest-enemy shooting and enemy chase.
- Five enemies, player HP, kill/win markers.
- HUD and a visible arena background.
- Headless auto-fire so G3 proves the arena can be cleared.
- Same create/compose/G1/G2/G3/G6 path as other cases.

## Implementation

- `modules/system.shooter`: primitive player/enemy/bullet simulation.
- `templates/shooter-topdown`: template manifest selecting the module.
- `fixtures/specs/shooter.yaml`: direct compose fixture.
- Updated eval/benchmark expectations and fixture module inventory.

## Evidence

- Real Godot: G1/G2/G3 pass, G6 pass (1280×720, 22 colors).
- Markers observed: `GAMEDREAM_BOOT_OK`, `GAMEDREAM_KILL`, `GAMEDREAM_WIN`.
- Benchmark: `3 playable / 3 fallback / 0 failed`.
- Existing action-rpg, platformer, and cross-engine paths unchanged.
- UE remains deferred.

## Limits

- Godot-only slice; Web/Unity shooter parity is not claimed.
- Enemies use simple chase AI and primitive visuals.

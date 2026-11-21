# Plan 44: Playable Roguelike Slice

## Goal

Move the `roguelike` benchmark case from `fallback` to `playable` with a real
seeded dungeon, turn-based combat, permadeath, and an exit.

## Scope

- Seeded maze generation with walls, floors, enemies, and a farthest-cell exit.
- Turn-based grid movement; bump attacks.
- Enemies chase and damage the player; zero HP is permanent.
- Enemy adjacent to spawn guarantees the kill marker is reachable.
- Headless BFS autoplay fights and escapes for G3.
- Same create/compose/G1/G2/G3/G6 path as other cases.

## Implementation

- `modules/system.roguelike`: maze generator, BFS pathing, turn loop, `_draw` map.
- `templates/roguelike-topdown`: template manifest selecting the module.
- `fixtures/specs/roguelike.yaml`: direct compose fixture.
- Updated eval/benchmark expectations and fixture module inventory.

## Evidence

- Real Godot: G1/G2/G3 pass, G6 pass (1280脳720, 26 colors).
- Markers observed: `GAMEDREAM_DUNGEON`, `GAMEDREAM_KILL`, `GAMEDREAM_WIN`.
- Benchmark: `4 playable / 2 fallback / 0 failed`.
- Existing action-rpg, platformer, shooter, and cross-engine paths unchanged.
- UE remains deferred.

## Limits

- Godot reference slice; Web and Unity roguelike smoke slices exist. Full engine parity is not claimed.
- One deterministic dungeon layout for benchmark reproducibility; no meta-progression.

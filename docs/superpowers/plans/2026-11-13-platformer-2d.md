# Plan 42: Playable 2D Platformer Slice

## Goal

Move the `platformer` benchmark case from `fallback` to `playable` by adding
a real `platformer-2d` Godot template and `system.platformer` module.

## Scope

- Side-view movement, gravity, jump, landing.
- Three collectible coins and a goal.
- HUD, camera follow, and a visible background.
- Headless autoplay so G3 can prove coins and the goal are reachable.
- Keep the same create/compose/G1/G2/G3/G6 path used by real cases.

## Implementation

- `modules/system.platformer`: `CharacterBody2D` player, static platforms,
  Area2D coins/goal, marker output.
- `templates/platformer-2d`: template manifest selecting the module.
- `fixtures/specs/platformer.yaml`: direct compose fixture.
- Updated eval/benchmark expectations and fixture module inventory.

## Evidence

- `GODOT_BIN` real runtime: G1/G2/G3 pass, G6 pass (1280×720, 22 colors).
- Benchmark: `2 playable / 4 fallback / 0 failed`.
  - playable: action-rpg, platformer.
  - fallback: shooter, roguelike, tower-defense, puzzle.
- Existing action-rpg and cross-engine paths unchanged.
- UE remains deferred.

## Limits

- This slice is Godot-only. Web/Unity platformer parity is not claimed.
- Coins are on the main ground path; platform jumps are optional for the
  automated victory, not required to finish.

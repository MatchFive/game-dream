# GameDream Case Benchmark Plan

**Goal:** Measure prompt-to-playable-game capability across genres, not just template routing.

**Architecture:** `cases/benchmark.json` defines prompts, expected genres/templates, and playable expectations. `dream benchmark` runs `createCommand` for each case with the selected provider, records actual template + G1/G2/G3, and reports `playable`, `fallback`, `unverified`, or `failed`. Exit 1 unless every case is playable.

## Global Constraints

- No UE.
- Fallback templates are never reported as playable.
- Real provider optional; fake provider is deterministic and labeled.
- Cases are reusable and do not modify the repo project.
- Benchmark is not part of the normal unit suite (it launches real Godot).

## Evidence

- Initial benchmark with fake provider + Godot: 1 playable / 5 fallback.
- After adding `platformer-2d`: `action-rpg` and `platformer` playable;
  shooter/roguelike/tower-defense still fallback to `fixture-minimal`; puzzle
  still falls back to `rpg-action-m1`.
- New summary: 2 playable / 4 fallback / 0 failed; exit 1 remains until all
  cases are playable.
- Platformer verify G1/G2/G3 and G6 pass; screenshot 1280×720 with 22 colors.
- Platformer slice: gravity/jump, coins, goal, background, HUD, headless autoplay.
- Unit tests cover playable-vs-fallback and duplicate case rejection.
- No UE changes.

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
- After adding `shooter-topdown`: 3 playable / 3 fallback / 0 failed.
- After adding `roguelike-topdown`: 4 playable / 2 fallback / 0 failed.
- After adding `tower-defense`: 5 playable / 1 fallback / 0 failed.
- After adding `puzzle-2d`: 6 playable / 0 fallback / 0 failed; exit 0.
- Platformer verify G1/G2/G3 and G6 pass; screenshot 1280×720 with 22 colors.
- Platformer slice: gravity/jump, coins, goal, background, HUD, headless autoplay.
- Shooter verify G1/G2/G3 and G6 pass; screenshot 1280×720 with 22 colors.
- Shooter slice: movement, shooting, chase AI, HP, background, HUD, auto-fire.
- Roguelike verify G1/G2/G3 and G6 pass; screenshot 1280×720 with 26 colors.
- Roguelike slice: seeded maze, turn-based combat, chasing enemies, permadeath.
- Tower-defense verify G1/G2/G3 and G6 pass; screenshot 1280×720 with 32 colors.
- Tower-defense slice: path, waves, build/upgrade, automatic fire.
- Puzzle verify G1/G2/G3 and G6 pass; screenshot 1280×720 with 20 colors.
- Puzzle slice: Sokoban levels, pushes, BFS autoplay, corrected classification.
- Unit tests cover playable-vs-fallback and duplicate case rejection.
- No UE changes.

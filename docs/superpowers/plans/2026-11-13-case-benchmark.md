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

- Real benchmark with fake provider + Godot:
  - `action-rpg`: playable (`rpg-action-m1`, G1/G2/G3 pass).
  - `platformer`, `shooter`, `roguelike`, `tower-defense`: fallback to
    `fixture-minimal`.
  - `puzzle`: fallback to `rpg-action-m1` and genre misclassified.
  - Summary: 1 playable / 5 fallback / 0 failed; exit 1.
- Unit tests cover playable-vs-fallback and duplicate case rejection.
- No UE changes.

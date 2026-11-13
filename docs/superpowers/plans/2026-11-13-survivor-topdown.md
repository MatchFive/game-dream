# Plan 48: Survivor-Like Benchmark Case

## Goal

Add a Vampire Survivors-like prompt as a seventh benchmark case, backed by a
real implementation rather than a label on an existing template.

## Case

- Prompt: `做一个类吸血鬼幸存者的俯视角生存游戏，自动攻击、升级和怪潮`
- Expected genre: `survivor`
- Expected template: `survivor-topdown`

## Implementation

- `modules/system.survivor`: top-down arena, continuous enemy spawns,
  auto-attack nearest enemy, XP and levels, damage growth, survival timer.
- `templates/survivor-topdown`: template manifest and markers.
- `fixtures/specs/survivor.yaml`: direct compose fixture.
- Classification and fake-provider rules recognize 吸血鬼/幸存者/survivor/割草/怪潮.
- Eval coverage extended to 21 prompts; benchmark extended to 7 cases.

## Evidence

- Real Godot: G1/G2/G3 pass, G6 pass (1280×720, 24 colors).
- Markers observed: `GAMEDREAM_SURVIVOR_SPAWN`,
  `GAMEDREAM_SURVIVOR_LEVEL`, `GAMEDREAM_WIN`.
- Benchmark: `7 playable / 0 fallback / 0 failed`, exit 0.

## Limits

- Godot-only; Web/Unity survivor parity is not claimed.
- Twelve-second survival slice; no weapon choice, evolutions, or meta-progression.
- Enemy composition and spawn points are fixed for deterministic verification.

# GameDream Case Benchmark

`benchmark.json` holds prompt-level acceptance cases. `dream benchmark` creates
each project with the selected provider, runs the normal G1/G2/G3 verification,
and reports whether the result is actually playable.

Statuses:

- `playable` — expected template selected and G1/G2/G3 pass.
- `fallback` — a different template (usually `fixture-minimal`) was selected.
- `unverified` — expected template selected but Godot was unavailable.
- `failed` — expected template selected but verification failed.

The benchmark exits 1 when any case is not playable. Fallback is deliberately not
counted as success; this is the signal used to decide which genre/template to
build next.

## Scoring

`dream benchmark` also reports a 0–100 score per case and an average:

- **playability** — `playable` = 1, `unverified` = 0.5, fallback/failed = 0.
- **intent** — expected template match = 0.6 plus expected genre match = 0.4;
  no expected genre means template match alone = 1.
- **visual** — only with `--visual`; G6 pass = 1, fail or skip = 0. It is not
  silently treated as passing when the engine is unavailable.

The per-case score averages the available components; `--visual` adds the G6
component and makes a visual failure exit non-zero.

## Baseline (2026-11-13)

With the deterministic fake provider and real Godot:

- `action-rpg`: playable (`rpg-action-m1`)
- `platformer`, `shooter`, `roguelike`, `tower-defense`: fallback to
  `fixture-minimal`
- `puzzle`: fallback to `rpg-action-m1` (and genre misclassification)

Result: `1 playable / 5 fallback / 0 failed` before the platformer slice. After
adding `platformer-2d`: `2 playable / 4 fallback / 0 failed`. After adding
`shooter-topdown`: `3 playable / 3 fallback / 0 failed`. After adding
`roguelike-topdown`: `4 playable / 2 fallback / 0 failed`. After adding
`tower-defense`: `5 playable / 1 fallback / 0 failed`. After adding
`puzzle-2d`: `6 playable / 0 fallback / 0 failed`. After adding
`survivor-topdown`: `7 playable / 0 fallback / 0 failed` (all seven cases
playable; `dream benchmark` exits 0). The survivor case is now a 60-second demo
with three weapons, upgrade choices, XP gems, elite brutes, and a phased boss.
This is the baseline to improve, not a release-quality score.

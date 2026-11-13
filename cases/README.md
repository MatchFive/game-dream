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

## Baseline (2026-11-13)

With the deterministic fake provider and real Godot:

- `action-rpg`: playable (`rpg-action-m1`)
- `platformer`, `shooter`, `roguelike`, `tower-defense`: fallback to
  `fixture-minimal`
- `puzzle`: fallback to `rpg-action-m1` (and genre misclassification)

Result: `1 playable / 5 fallback / 0 failed`. This is the baseline to improve,
not a release-quality score.

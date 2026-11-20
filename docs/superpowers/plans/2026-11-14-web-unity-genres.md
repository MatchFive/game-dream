# Plan 60: Web/Unity Genre Coverage

## Goal

Complete Web and Unity coverage for roguelike, tower-defense, and puzzle.

## Web

- `templates/web-roguelike`: deterministic grid run, bump enemies, exit win.
- `templates/web-tower-defense`: path, auto-build/upgrade, 5 waves, base HP.
- `templates/web-puzzle`: two push-puzzle chambers, target win.
- Each has shared `sim.mjs` + `sim-run.mjs` and `WEB_BOOT_OK`/`WEB_WIN`.
- Screenshots: roguelike 32 colors, tower-defense 87 colors, puzzle 53 colors.

## Unity

- `templates/unity-roguelike`
- `templates/unity-tower-defense`
- `templates/unity-puzzle`
- Shared `GenreSim` mode driver plus the existing static verification shell.
- Runtime evidence: Unity 6000.6.9f1 batchmode passed for all three with
  `UNITY_SIM_OK` + `UNITY_WIN`.

## Tests

- `packages/cli/test/web-genres.test.ts`
- `packages/cli/test/unity-genres.test.ts`

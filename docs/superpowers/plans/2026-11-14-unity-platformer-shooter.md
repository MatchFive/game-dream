# Plan 61: Unity Platformer and Shooter Coverage

## Goal

Complete Unity smoke coverage for the remaining Web genres.

## Implemented

- `templates/unity-platformer` using `GenreSim` mode `platformer`.
- `templates/unity-shooter` using `GenreSim` mode `shooter`.
- Both reuse the Unity M0 static-verification shell and runtime bootstrap.
- Headless markers:
  - `UNITY_PLATFORMER_START`, `UNITY_PLATFORMER_JUMP`, `UNITY_WIN`
  - `UNITY_SHOOTER_START`, `UNITY_SHOOTER_WAVE`, `UNITY_WIN`

## Evidence

- Static verification passed for both.
- Unity 6000.6.9f1 batchmode runtime passed for both with
  `UNITY_SIM_OK` + `UNITY_WIN`.
- `packages/cli/test/unity-genres.test.ts` now covers five Unity genres.

## Limits

These are deterministic smoke/coverage slices, not full Unity gameplay ports.

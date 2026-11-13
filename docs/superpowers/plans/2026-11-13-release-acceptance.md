# GameDream Release Acceptance Plan

**Goal:** Provide one command that accepts already-built Web/Godot/Unity release artifacts and records verifiable results in a machine-readable manifest.

**Architecture:** `scripts/release-acceptance.mjs` calls the built `dream` CLI for each provided engine. Web is verified and packaged; Godot is packaged and real-runtime verified when `GODOT_BIN` is available; Unity is statically verified and runtime-verified when `UNITY_BIN`/`--unity` is available. The script writes JSON with commands, exit codes, artifact paths, and timestamps.

## Global Constraints

- No UE.
- No fake pass: every engine record comes from a CLI exit code.
- Runtime checks are opt-in via `--godot-bin` / `--unity` or environment; skipped checks are explicit.
- The manifest is written even on failure, with the failing engine.
- No new dependencies.

## Evidence

- Local three-engine acceptance with Web M1, Godot M1 source, Unity M1 source:
  - Web verify markers `WEB_BOOT_OK`, `WEB_MAP_OK`, `WEB_QUEST_COMPLETE`,
    `WEB_BOSS_PHASE`, `WEB_WIN`; package 15 files / 1,255,046 bytes.
  - Godot package 218 files / 146,216 bytes; runtime verify G1/G2/G3 pass.
  - Unity static + runtime verify pass (`UNITY_SIM_OK`, `UNITY_WIN`).
  - `acceptance.json` status `pass`, with commands, exit codes, artifacts.
- `pnpm release:accept` supplied the same flow locally; `--skip-runtime` remains
  available for CI-only environments.

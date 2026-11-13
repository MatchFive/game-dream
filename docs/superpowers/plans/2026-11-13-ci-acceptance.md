# GameDream CI Acceptance Plan

**Goal:** Run the three-engine release acceptance against CI-produced artifacts and publish the acceptance manifest.

**Architecture:** Add a `release-acceptance` job after the Web/Godot/Unity artifact jobs. It downloads all artifacts, builds the CLI, runs `scripts/release-acceptance.mjs --skip-runtime` (Ubuntu has no Unity/Godot), uploads `acceptance.json`, and makes the SHA-256 manifest depend on it.

## Global Constraints

- No UE.
- CI acceptance validates downloaded artifacts, not source working directories.
- Runtime checks stay skipped in CI with explicit reasons; local `--godot-bin/--unity-bin` still runs them.
- Manifest includes acceptance.json.
- No new dependencies.

## Evidence

- Local acceptance against packaged artifacts (`C:\temp\gd-accept40`):
  - Web verify/package pass.
  - Godot package pass (repackage of the CI artifact).
  - Unity static verify pass; runtime skipped explicitly.
  - `acceptance.json` status pass.
- CI now downloads `gamedream-web-release`, `gamedream-godot-release`,
  `gamedream-unity-release`, runs acceptance with `--skip-runtime`, uploads
  `gamedream-acceptance`, and feeds it into the SHA-256 manifest.
- README documents local acceptance and rollback.

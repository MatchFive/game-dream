# GameDream Release Matrix Plan

**Goal:** Make Web, Godot, and Unity release artifacts reproducible in CI without expanding to UE.

**Architecture:** Keep the existing test job. Add engine release jobs that compose/package the shared M1 content on Ubuntu using only Node tooling (no Unity/Godot binaries), upload each artifact, then build a SHA-256 release manifest. Unity/Godot runtime tests remain opt-in locally.

## Global Constraints

- No UE.
- Release jobs do not require Unity or Godot executables.
- Web requires headless verify; Unity requires static verify; Godot requires source package validation.
- Artifacts upload with `if-no-files-found: error`.
- Manifest records path/bytes/SHA-256 for every file.

## Evidence

- Locally exercised release commands:
  - Godot compose (31 modules) + `godot package`: 218 files, 146,216 content bytes.
  - Unity compose with shared M1 content + static verify: passed.
  - Web compose/verify/package path remains the existing CI job.
- CI YAML adds three engine artifact jobs and a SHA-256 manifest; no Unity/Godot
  executable is required for release jobs.
- UE remains out of scope.

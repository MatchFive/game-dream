# GameDream Godot Release Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Make generated Godot projects release-ready: ship export presets, package a clean source release with hashes, and expose `dream godot export` for native export when Godot export templates are installed.

**Architecture:** Core generates a Windows/Linux/Web `export_presets.cfg` once (user-editable). A Godot packager copies the project without `.godot`/build/screenshot artifacts into an atomic release directory with `release.json` hashes. An export wrapper imports then invokes Godot `--export-release` and reports missing templates clearly.

**Tech Stack:** Existing Godot composer/runner; no new dependencies.

## Global Constraints

- `export_presets.cfg` is generated only when absent; user edits survive recompose.
- `dream godot package` excludes `.godot/`, `build/`, screenshots, backups, temp files; includes modules/game/assets.
- Non-empty output requires `--force`; staging commit preserves the old release on failure.
- `dream godot export` requires Godot 4.4+, an existing preset, and installed export templates; missing templates are an explicit exit 3 with guidance.
- No real export is required in CI; fake-runner tests cover args/failures.
- Web/Godot existing verify/screenshot behavior unchanged.

## Review Focus

1. Preset format/paths/user-edit preservation.
2. Package exclusion/copy safety/hash manifest/force/atomicity.
3. Export args, template failure classification, output existence.
4. CLI exit/JSON/docs.
5. Tests for presets/package/export.

---

### Task 1: Export presets

- Files: `packages/core/src/composer/generate-export-presets.ts`, compose, tests.
- Test: generated once, contains presets, preserves edits.
- Commit.

### Task 2: Godot package/export core + CLI

- Files: `packages/godot/src/package.ts`, `export-project.ts`, CLI, tests.
- Test: exclusions/hashes/force; export args/missing templates.
- Commit.

### Task 3: Docs/full verification/review

- README/docs; suite/typecheck/build; fake export test.
- Commit.

## Self-Review

- Presets, package layout, export args, templates, CLI, docs, Godot tests.
- Deferred: automatic template download, code signing, Android/iOS.

# GameDream Release CI Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Add a repeatable CI/release path and make Godot export-template availability visible before users attempt native export.

**Architecture:** `@gamedream/godot` detects the platform-specific export-template directory for the detected Godot version. `dream doctor` warns without failing; `dream godot templates` prints status/JSON. GitHub Actions runs typecheck/test/build and offers a manual Web release artifact job. Docs explain template installation and CI limitations.

**Tech Stack:** Node fs/path; GitHub Actions; existing CLI.

## Global Constraints

- Missing export templates are a warning in `doctor`, not a failure; `godot templates` exits 1 when missing.
- Version normalization maps `4.4.1.stable.official...` to `4.4.1.stable`.
- CI runs offline unit/integration tests; Godot/browser E2E skip when unavailable.
- Manual Web release job composes/verifies/packages M1 and uploads an artifact; no secrets.
- No template download/extract automation; docs cover official installation.

## Review Focus

1. Template path/version/platform detection across Windows/macOS/Linux.
2. Doctor warning semantics and JSON/output.
3. CLI `godot templates` exit/JSON.
4. CI workflow correctness (manual trigger, frozen install, artifact).
5. Docs and tests.

---

### Task 1: Template detection + doctor/CLI

- Files: `packages/godot/src/templates.ts`, index, doctor, program, tests.
- Test: version normalization, platform files, missing, doctor warning.
- Commit.

### Task 2: CI/release workflow + docs

- Files: `.github/workflows/ci.yml`, docs/ci.md, README.
- Test: workflow syntax/manual job; package artifact commands.
- Commit.

### Task 3: Full verification/review

- Suite/typecheck/build; CLI smoke.
- Commit.

## Self-Review

- Templates, doctor, CLI, CI, docs, tests.
- Deferred: automatic template download, Godot in ubuntu CI, signing.

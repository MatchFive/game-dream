# GameDream Web Package Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Turn a generated Web project into a deployable static directory with validation, asset copying, deterministic file hashes, and hosting documentation.

**Architecture:** New `packages/web/src/package.ts` validates required files, copies the managed project files plus `assets/`, refuses accidental overwrites, and writes `deployment.json` with entry/name/size/sha256 entries. CLI adds `dream web package`; docs cover static hosts.

**Tech Stack:** Node fs/crypto; no zip or new dependencies.

## Global Constraints

- Package output contains `index.html`, runtime modules, `game.json`, `vendor/phaser.min.js`, README, and `assets/` when present.
- Screenshots, profiles, logs, and `deployment.json` are not copied into the package.
- Non-empty output requires `--force`; missing required files fail with a clear message.
- Hashes/sizes make packages reproducible and detectable.
- Generated packages still pass `dream web verify` and browser screenshots.
- No Godot changes; no network/deploy API.

## Review Focus

1. File selection/copy safety, traversal/symlinks, overwrite behavior.
2. Hash determinism/format, deployment.json contents.
3. CLI exit/JSON behavior and docs.
4. Package still verifies and renders; screenshots excluded.
5. Tests/assets/edge cases (missing vendor, empty assets, force).

---

### Task 1: Package core

- Files: `packages/web/src/package.ts`, `index.ts`, tests.
- Test: M0/M1 package, hashes, exclusions, force/missing vendor.
- Implement: validation/copy/hashes.
- Commit.

### Task 2: CLI + docs

- Files: CLI command/program, README, `docs/deploy-web.md`, template README.
- Test: command function; docs.
- Implement: `dream web package`.
- Commit.

### Task 3: Full verification/review

- Run suite/typecheck/build; package verify/screenshot; review.
- Commit.

## Self-Review

- File selection, assets, force, hashes, deploy docs, CLI, verify/screenshot.
- Deferred: ZIP archives, cloud deploy hooks, CDN invalidation.

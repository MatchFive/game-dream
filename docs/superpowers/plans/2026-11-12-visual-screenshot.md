# GameDream M1 Visual Screenshot Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Add a windowed screenshot path and a G6 visual smoke gate. The composer generates a no-op screenshot autoload that activates only with `--screenshot`; `dream screenshot` captures a PNG; `dream verify --visual` runs G6 with dimensions, non-black ratio, and color-count thresholds.

**Architecture:** `game/_generated/screenshot.gd` is an autoload in every generated project. It checks `OS.get_cmdline_user_args()`, starts a new game, waits 60 frames, captures the viewport, computes metrics, saves `user://screenshot.png`, prints path/metrics/OK, and quits. `packages/godot` runs it windowed (no `--headless`) and copies the PNG to the requested path. `verify --visual` adds optional G6; existing G1–G3 and M0/fixture behavior are unchanged when `--visual` is off.

**Tech Stack:** Godot 4.4 windowed renderer; viewport image capture; existing CLI/verify/composer; no new npm dependencies.

## Global Constraints

- Normal runs and M0/fixture never capture: no `--screenshot` user arg means immediate no-op.
- Screenshot runs must not use `--headless`; G6 is opt-in via `--visual`.
- Metrics JSON: `{ width, height, samples, non_black, colors }`; thresholds width≥640, height≥360, non-black/total≥0.05, colors≥8.
- The PNG is copied to `game/_generated/screenshot.png` by default; `--screenshot-out` overrides.
- G6 failure/skip must not change existing G1–G3 results.
- No golden-image comparison; G6 is render smoke + deterministic readability metrics (VLM hook deferred).

## Review Focus

1. Capture script only activates with the user arg; starts gameplay and waits enough frames.
2. Windowed runner does not pass `--headless`; parses path/metrics robustly (Windows paths/spaces).
3. G6 optional, exit codes, and G1–G3 unchanged.
4. Screenshot autoload ordering and M0/fixture no-op.
5. Metrics thresholds catch black/empty renders without false positives.

---

### Task 1: Composer screenshot autoload

- Files: `packages/core/src/composer/generate-screenshot-script.ts`, `compose.ts`, `generate-project-godot.ts`, tests.
- Test: project.godot contains `ScreenshotCapture`; generated script exists and no-ops without arg.
- Implement: generate script; managed file + autoload; wait frames; close menu; emit game.started; metrics; save/print.
- Commit.

### Task 2: Windowed runner + `dream screenshot`

- Files: `packages/godot/src/run-screenshot.ts`, `index.ts`; `packages/cli/src/commands/screenshot.ts`, `program.ts`; tests.
- Test: args contain `--screenshot`, not `--headless`; path/metrics parsed; output copied; missing marker fails.
- Implement: run windowed, parse markers, copy PNG, print metrics; CLI exit codes.
- Commit.

### Task 3: Verify G6

- Files: `packages/cli/src/commands/verify.ts`, `program.ts`; tests.
- Test: `--visual` adds G6; thresholds pass/fail; absent without flag; exit codes.
- Implement: optional G6 after G2/G3; run screenshot; check metrics + file size.
- Commit.

### Task 4: E2E + docs

- Files: `packages/cli/test/screenshot-e2e.test.ts`, `README.md`.
- Test: compose m1, `verify --visual`, G6 pass, PNG exists.
- Run full tests, typecheck, build.
- Commit.

## Self-Review

- Capture activation, windowed args, path parsing, G6 optionality, M0 no-op, threshold false positives.
- Deferred: VLM readability rubric, golden images, cross-run pixel regression, Linux xvfb.

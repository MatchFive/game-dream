# GameDream Web Screenshot Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Add real-browser Web screenshot and G6 visual verification: serve the generated project, capture it with installed Edge/Chrome headless, decode PNG metrics, and let `dream web verify --visual` fail on blank/broken pages.

**Architecture:** New `packages/web/src/screenshot.ts` contains browser discovery, a local static server, headless capture, and a dependency-free PNG decoder. `captureWebScreenshot` returns image/metrics; `verifyWebVisual` applies the same thresholds as Godot G6. CLI adds `dream web screenshot` and `web verify --visual`.

**Tech Stack:** Node `http`, `child_process`, `zlib`; installed Edge/Chrome. No Playwright/Puppeteer.

## Global Constraints

- Browser resolution order: `--browser`, `GAMEDREAM_BROWSER`, `CHROME_BIN`, `EDGE_BIN`, platform paths, PATH commands.
- Screenshot default: `<project>/screenshot.png`; viewport 1280×720.
- Serve only inside the project; MIME for HTML/JS/CSS/JSON/SVG/PNG.
- PNG metrics: width/height, sampled colors, non-black ratio, center colors; threshold matches Godot G6.
- No browser: return a clear failure (`exitCode 3` in CLI), tests skip real capture.
- Existing headless `web verify` stays unchanged.

## Review Focus

1. Server traversal/MIME/shutdown; browser arg injection.
2. Screenshot waits long enough for fetch/ESM/Canvas draw.
3. PNG decoding correctness and metric thresholds.
4. CLI exit codes/JSON; missing browser.
5. Tests and docs; no Godot regressions.

---

### Task 1: Screenshot core

- Files: `packages/web/src/screenshot.ts`, `packages/web/src/index.ts`.
- Test: PNG metrics unit from synthetic fixture or real Edge; browser discovery.
- Implement: static server, headless capture, PNG decode, visual failure.
- Commit.

### Task 2: CLI + docs

- Files: `packages/cli/src/commands/web.ts`, `packages/cli/src/program.ts`, README/template README.
- Test: command wiring; JSON/exit.
- Implement: `web screenshot`, `web verify --visual`.
- Commit.

### Task 3: Real-browser E2E + full verification

- Files: `packages/web/test/screenshot.test.ts`.
- Test: real Edge/Chrome capture when available; skip otherwise.
- Run suite/typecheck/build; review; commit.

## Self-Review

- Browser detection, server safety, capture timing, metrics, thresholds, CLI, docs.
- Deferred: Playwright, Phaser, pixel-diff baselines.

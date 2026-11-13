# GameDream M1 Visual Review Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Add an optional VLM readability review to G6. After the screenshot metrics pass, a `VisionProvider` reviews the PNG and must confirm HUD, player, enemy, and dialogue are visible/readable. Fake and OpenAI-compatible vision providers are available; fake keeps CI model-free.

**Architecture:** `packages/agent` gains `VisualReview` (Zod), a `VisionProvider` port, `FakeVisionProvider`, `OpenAIVisionProvider` (base64 image + JSON response), and a factory. `verify --visual --vision fake|openai` runs the existing screenshot/metric gate, then the vision review; G6 fails on invalid/failed reviews. The image never leaves the machine with fake.

**Tech Stack:** Existing screenshot pipeline; OpenAI-compatible chat completions with image_url data URLs; no new npm dependencies.

## Global Constraints

- `--vision` implies `--visual`; no review without a screenshot.
- Review fields: `readable, hud_visible, player_visible, enemy_visible, dialogue_readable, issues`.
- G6 requires all four visibility/readability booleans true.
- Fake provider is deterministic and model-free; OpenAI requires `OPENAI_API_KEY`.
- Missing API key / invalid review JSON / HTTP errors are G6 failures, not crashes.
- Existing G1–G3 and metric-only G6 behavior stay unchanged when `--vision` is absent.

## Review Focus

1. Vision port/fake/OpenAI provider shape and error mapping.
2. G6 combines metrics + review; missing/invalid review fails.
3. `--vision` implies `--visual`; OpenAI key handling.
4. Fake/offline tests and real screenshot E2E with fake review.
5. No image logged/secrets leaked.

---

### Task 1: Vision provider layer

- Files: `packages/agent/src/vision/*`, `index.ts`, `errors.ts`.
- Test: fake default/custom; OpenAI request contains base64 image; invalid JSON; missing key.
- Implement: schema, port, fake, OpenAI provider, factory.
- Commit.

### Task 2: Verify G6 review

- Files: `packages/cli/src/commands/verify.ts`, `program.ts`.
- Test: vision implies visual; fake pass; custom fail; invalid review.
- Implement: optional vision options, provider injection, review failure mapping.
- Commit.

### Task 3: CLI/E2E/docs

- Files: `packages/cli/test/screenshot-e2e.test.ts`, README.
- Test: real screenshot + fake vision G6 pass.
- Run full tests, typecheck, build.
- Commit.

## Self-Review

- Missing key, invalid JSON, API errors, metric+review combination, --vision implies --visual, fake E2E.
- Deferred: real vision model benchmark, image caching, multi-frame review.

# GameDream Web Camera Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Improve Web readability by making the Phaser camera follow the player with map bounds and responsive zoom (desktop ~1.2, mobile ~2.0), without changing sim, HUD, touch, save, or screenshot contracts.

**Architecture:** GameScene sets camera bounds/world size, follows the player actor, applies zoom based on coarse pointer/viewport, and refreshes on level changes/resizes. HUD remains DOM; sim remains untouched.

## Global Constraints

- Camera bounds equal current map/world bounds; no blank areas.
- Desktop zoom ~1.2; coarse/narrow viewport zoom ~2.
- Level changes recreate actors and reattach follow; resize updates zoom/bounds.
- Desktop/mobile screenshots still pass; M0/M1 markers unchanged.
- No save/audio/pause changes; no new dependencies.

## Review Focus

1. Camera follow/bounds on level transitions and resizes.
2. Zoom responsiveness and mobile/desktop screenshot parity.
3. Player near map edges; no camera drift/blank.
4. HUD/touch/pause/save isolation.
5. Tests/docs.

---

### Task 1: Camera setup/follow

- Files: `templates/web-m0/game.js`, tests/docs.
- Test: source assertions; real screenshots.
- Implement: bounds/zoom/follow/reapply.
- Commit.

### Task 2: Verification/review

- Full suite/typecheck/build; Edge desktop/mobile screenshots; review.
- Commit.

## Self-Review

- Bounds, zoom, follow, transitions, edge cases, screenshots, M0/M1.
- Deferred: smooth camera shake, parallax.

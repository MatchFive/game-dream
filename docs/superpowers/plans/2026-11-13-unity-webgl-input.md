# GameDream Unity WebGL Input Smoke Plan

**Goal:** Prove the built Unity WebGL page accepts keyboard input, not just that it renders.

**Architecture:** Extend the existing Web CDP capture with optional key inputs. It focuses/clicks the canvas, captures before/after PNGs, dispatches `Input.dispatchKeyEvent`, and fails if the canvas pixels do not change. `unity webgl-check` defaults to an ArrowRight hold.

## Global Constraints

- No UE changes.
- No new dependencies; reuse `@gamedream/web` CDP/static server.
- Existing Web screenshots without input remain unchanged.
- Input failure is a real failure (exit 1/2), not a warning.
- WebGL remains uncompressed and served over HTTP.

## Evidence

- `dream unity webgl-check` on the built WebGL directory loaded Unity in
  headless Chrome/Edge, focused/clicked the canvas, held ArrowRight, and
  produced a changed 1280×720 screenshot (197 colors vs the 211-color idle
  capture) — the player moved and HP changed.
- Existing Web screenshot tests without input still pass.
- Full suite: 179 passed, 2 optional Unity tests skipped; typecheck/build green.

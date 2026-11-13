# GameDream Unity Equipment UI + WebGL Browser Plan

**Goal:** Show equipped slots/stats in the Unity HUD and validate a freshly built WebGL bundle in a real headless browser.

**Architecture:** `GameBootstrap` adds an `E` equipment panel using `GameSim.Equipment` and effective stats. CLI `unity webgl-check` reuses the existing `@gamedream/web` CDP/static-server screenshot path with a longer settle window, requiring a real non-blank browser capture.

## Global Constraints

- WebGL check requires `index.html` + `Build/` and a fresh PNG; no fake pass.
- Browser absence exits 3; page/screenshot failure exits 1.
- Equipment panel is IMGUI (not in RenderTexture screenshots).
- M0/M1 runtime, save, build and smoke contracts remain.
- No new dependencies.

## Evidence

- `dream unity webgl-check` against the built WebGL directory loaded Unity in
  headless Edge/Chrome and produced a fresh 1280×720 screenshot with 211 colors.
- Unity M1 runtime/build/smoke passed with equipment and save markers
  (`UNITY_SAVE_OK`, `UNITY_LOOT_OK`, quest/boss/win).
- Equipment panel is available in Play mode via `E`; HUD shows equipped slots,
  effective damage and max HP.

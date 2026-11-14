# Plan 54: Survivor Asset Pipeline

## Goal

Start P0 asset work by replacing pure primitive characters with real imported
SVG textures while preserving the deterministic survivor loop.

## Implemented

- SVG assets for player, crawler, brute, boss, and XP gem.
- `system.survivor` preloads and draws those textures.
- Assets are copied into the `survivor-demo` skill kit so generated projects
  inherit them.
- Existing HUD, aura/nova effects, boss ring, and markers remain.

## Evidence

- Real Godot compose + verify:
  `G1/G2/G3/G6 pass`, `1280x720`, `62 colors`.
- Asset screenshot inspected: textured player, enemies, boss/gem shapes visible.

## Remaining asset work

- Animation frames and audio assets.
- Asset generation tool/content pack rather than fixed skill assets.
- Vision-based asset review beyond color metrics.

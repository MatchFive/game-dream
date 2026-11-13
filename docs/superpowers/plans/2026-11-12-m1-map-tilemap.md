# GameDream M1 Map/TileMap Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Add content-driven tile maps to the two-level campaign. Each level references a map JSON; `system.map` builds a `TileMapLayer` with generated floor/wall tiles and static wall collisions. M1 gains `GAMEDREAM_MAP_OK`; M0/fixture remain map-free.

**Architecture:** `ContentDB` loads `game/content/maps/*.json`. `system.levels.current_map()` resolves a level's `map` id. `system.map` (`MapService`) builds a `TileMapLayer` plus a `StaticBody2D` of wall rectangles from row strings. `gameflow` clears and rebuilds `MapRoot` per level. No external art assets: floor/wall textures are generated in code from colors in the map JSON.

**Tech Stack:** Existing composer + Godot 4.4 `TileMapLayer`; JSON content; headless autoplay.

## Global Constraints

- Content stays in `game/content/maps` and is user-owned; copy-if-missing only.
- Map JSON: `{ id, tile_size, tileset: { floor, wall }, rows: string[] }`; `#` wall, `.` floor.
- M1 marker order: `BOOT_OK, MAP_OK, DIALOGUE, LEVEL_UP, EQUIPPED, SKILL_CAST, LEVEL_2, QUEST_COMPLETE, WIN`.
- M0/fixture have no `system.map`; `MapRoot` stays empty and markers are unchanged.
- Map building must tolerate missing service, missing map, empty rows, and invalid colors.

## Review Focus

1. Map data loading and fallback.
2. TileMapLayer/tileset creation works headless; no external files.
3. Wall collisions align with wall tiles; player/enemy spawn on floor.
4. Map rebuild lifecycle clears old nodes; M1 marker once per run.
5. M0/fixture compatibility.

---

### Task 1: ContentDB maps

- Files: `modules/core.content/src/content_db.gd`, `api.md`.
- Test: m1 compose copies maps; `get_map`; invalid rows warning.
- Implement: load `maps`; getter; warning when `rows` is not an Array.
- Commit.

### Task 2: `system.map`

- Files: `modules/system.map/**`.
- Test: manifest/service tokens `TileMapLayer`, `set_cell`, `build`; template includes module.
- Implement: generated 2-tile atlas, TileMapLayer, StaticBody2D wall rectangles; return bool.
- Commit.

### Task 3: Campaign maps + level resolution

- Files: `modules/system.levels/src/level_service.gd`, `api.md`, `templates/rpg-action-m1/content/maps/*.json`, `content/levels/campaign.json`.
- Test: levels reference `clearing`/`grove`; rows are 20×40; levels service `current_map`.
- Implement: two maps with different colors; border walls; `current_map()`.
- Commit.

### Task 4: Gameflow map root + marker + template

- Files: `modules/system.gameflow/src/gameflow.gd`, `scenes/game.tscn`, `templates/rpg-action-m1/template.yaml`, `README.md`.
- Test: `MapRoot`, `GAMEDREAM_MAP_OK`; markers 9; m0 no map.
- Implement: clear MapRoot per level, build map, print marker once; New Game resets marker; add `system.map`; marker order.
- Commit.

### Task 5: Tests + full verification

- Files: `packages/core/test/fixtures.test.ts`, `m1-compose.test.ts`, `m0-compose.test.ts`, `packages/cli/test/create.test.ts`, `m0-verify.test.ts`.
- Test: 26 modules; map tokens; m1 map content + MapService autoload + 9 markers; m0 no MapService; real E2E all markers.
- Run full tests, typecheck, build.
- Commit.

## Self-Review

- Map fallback, texture/tileset lifecycle, collision alignment, map marker once, m0 compatibility.
- Deferred: Tiled/LDtk import/export, sprite/art assets, camera bounds, multi-room maps.

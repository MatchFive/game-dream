# GameDream Tiled Interop Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Add lossless round-trip conversion between GameDream's internal map JSON and Tiled JSON (`.tmj`). Export writes a 2-tile PNG sheet; import restores rows, tile size, colors, and id. CLI exposes `dream map export/import`.

**Architecture:** A map schema in `@gamedream/core`; pure `toTiledMap`/`fromTiledMap` converters; a tiny dependency-free PNG encoder for the 2-tile sheet; Tiled custom properties carry `gamedream_id`, floor, and wall colors. CLI commands read/write files; tests use temp files and round-trip.

**Tech Stack:** Existing TypeScript/Zod; Node `zlib` for PNG; Tiled 1.10 orthogonal JSON.

## Global Constraints

- Internal rows: `#` wall, `.` floor; equal widths required.
- Tiled gids: 0 empty (imports as floor), 1 floor, 2 wall with `firstgid: 1`.
- Export/import must preserve id, tile size, floor/wall colors, width/height, and rows.
- Unsupported Tiled features (infinite/compressed/base64, non-orthogonal, mismatched dimensions) fail with clear errors.
- No new npm dependencies; export PNG is generated in-process.
- Runtime game code is unchanged; this is a content/CLI feature.

## Review Focus

1. Round-trip fidelity (rows, width/height, id, colors, tile size).
2. Tiled shape/gid validation and clear errors.
3. PNG shape/signature and tileset metadata.
4. CLI paths, `.tmj`/`.png` naming, overwrite behavior.
5. No changes to runtime/composer semantics.

---

### Task 1: Core map schema + converters + PNG

- Files: `packages/core/src/schemas/map.ts`, `packages/core/src/maps/tiled.ts`, `packages/core/src/maps/tile-sheet.ts`, `index.ts`.
- Test: round-trip; gids; PNG signature; invalid orientation/data.
- Implement: schema, export/import, color properties, PNG encoder.
- Commit.

### Task 2: CLI map commands

- Files: `packages/cli/src/commands/map.ts`, `program.ts`.
- Test: export writes `.tmj` + `.png`; import restores JSON; errors exit 1.
- Implement: `dream map export --map --out`; `dream map import --tmj --out [--id/--floor/--wall/--layer]`.
- Commit.

### Task 3: Docs + full verification

- Files: README.
- Test: full tests, typecheck, build.
- Commit.

## Self-Review

- Round-trip, Tiled gids/empty, color metadata, PNG validity, CLI failure paths.
- Deferred: object layers, tileset art import, infinite maps, LDtk.

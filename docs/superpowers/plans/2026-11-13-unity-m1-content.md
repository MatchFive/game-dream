# GameDream Unity M1 Content Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Align Unity with the shared M1 campaign: five levels, maps/wall collision, enemy variants, kill quests, boss phase, and HUD markers; M0 remains a single arena.

**Architecture:** `packages/unity` reads `campaign.json`, maps, quests and embeds them into `Assets/Resources/GameConfig.json`. C# `GameSim` uses optional `levels`; without levels it builds the old M0 arena. `GameBootstrap` renders map tiles/actors/HUD; `EditorVerifier` autoplays and emits Unity markers.

**Tech Stack:** Existing Unity 6000.6.9f1 template, TypeScript compose/CLI, shared `templates/rpg-action-m1/content`.

## Global Constraints

- Same content files as Godot/Web; no Unity-only content fork.
- M0 (`levels` absent) remains spawn/attack/win and M0 smoke/screenshot.
- Wall collision and spawn snapping for player/enemy; no wall clipping.
- Kill quests, boss phase, and five-level progression are headless-checkable.
- No new dependencies; no Unity binaries.

## Review Focus

1. Content schema validation/parity with Web.
2. Map collision/snap/chase/autoplay across all five levels.
3. Quest/boss markers and M0 fallback.
4. HUD/map rendering and level transitions.
5. Tests/docs/full runtime.

---

### Task 1: Content embedding

- Files: `packages/unity/src/compose.ts`, CLI.
- Test: five levels, four quests, map rows.

### Task 2: C# campaign sim

- Files: `GameConfig.cs`, `GameSim.cs`, `GameBootstrap.cs`, `EditorVerifier.cs`.
- Test: real M1 runtime markers and auto-clear.

### Task 3: Visual/build regression

- Map tiles/HUD, M0 fallback, build/smoke/screenshot, docs.

## Evidence

- Unity `6000.6.9f1`, `C:\temp\gd-unity-m1-33` composed with
  `--content templates/rpg-action-m1/content`:
  - `EditorVerifier` exit 0; markers `UNITY_SIM_OK`, `UNITY_MAP_OK`,
    `UNITY_BOSS_PHASE`, `UNITY_QUEST_COMPLETE`, `UNITY_WIN`.
  - M1 screenshot captured map floor/walls, player, and enemy.
  - M1 Windows build and smoke passed.
- M0 build/smoke/screenshot regression passed after the campaign sim rewrite.
- Unit content test: 5 levels, 4 quests, 20 map rows, wisp range 180.

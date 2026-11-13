# GameDream M1 Multi-Level Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Turn the M1 single arena into a two-level, content-driven campaign with level transitions, per-level enemy stats, quest completion across both kills, and a new `GAMEDREAM_LEVEL_2` marker. Keep M0/fixture behavior compatible.

**Architecture:** `system.levels` loads `game/content/levels/campaign.json`, tracks the current index, emits `level.transition` and `level.started`, and saves the index. `gameflow` owns an `EnemyRoot`, spawns one enemy from level data, advances levels on enemy death, and loops autoplay until win/lose. `ui.level_transition` fades a full-screen overlay on `level.transition`.

**Tech Stack:** Existing composer + Godot 4.4; JSON content; headless autoplay.

## Global Constraints

- Content stays in `game/content/levels` and is user-owned; copy-if-missing only.
- Existing markers stay; new M1 markers: `GAMEDREAM_LEVEL_2` (before `QUEST_COMPLETE`/`WIN`).
- M1 marker order: `BOOT_OK, DIALOGUE, LEVEL_UP, EQUIPPED, SKILL_CAST, LEVEL_2, QUEST_COMPLETE, WIN`.
- M0/fixture have no `system.levels`; gameflow falls back to one default enemy.
- Save/load includes the level index; loading while alive respawns the saved level; loading during `_win` must not respawn.
- Transition is visual (fade overlay) plus level content swap; no engine scene-file rewrite.

## Review Focus

1. Level content loading and missing/invalid data fallback.
2. Spawn/clear enemy lifecycle; no duplicate `died` connections or freed-node access.
3. Autoplay loop reaches level 2 and win without hanging; marker exactly once.
4. Save/load level index does not respawn during `_win`.
5. m0/fixture still use one default enemy and unchanged markers.

---

### Task 1: ContentDB + `system.levels`

- Files: `modules/core.content/src/content_db.gd`, `modules/system.levels/**`, `templates/rpg-action-m1/content/levels/campaign.json`.
- Test: m1 compose copies campaign; `get_level`/`levels` loaded; manifest depends content/events; save section `levels`.
- Implement: load `levels`; guard `levels` array; LevelService picks `campaign` (else first), `current_level`, `has_next`, `advance` (emits transition/started), `reset`, `serialize`/`deserialize` (emits started).
- Commit.

### Task 2: Gameflow spawn + two-level loop

- Files: `modules/system.gameflow/src/gameflow.gd`, `modules/system.gameflow/scenes/game.tscn`, `modules/system.combat/src/health_component.gd`.
- Test: source contains `EnemyRoot`, `level.started`, `GAMEDREAM_LEVEL_2`; m0 E2E still passes.
- Implement: remove fixed Enemy, add EnemyRoot; `_apply_level` instantiates enemy scene with level stats; `_on_enemy_died` advances or wins; heal player on level change; autoplay loops movement/attack until `_finished` (1200-frame cap).
- Commit.

### Task 3: Transition UI

- Files: `modules/ui.level_transition/**`.
- Test: manifest `ui_mounts`; source contains `level.transition`, `create_tween`; m1 main scene mounts it.
- Implement: CanvasLayer layer 30, full-screen ColorRect fade out/in on transition; no input.
- Commit.

### Task 4: Content, template, markers

- Files: `templates/rpg-action-m1/content/quests/kill_slime.json`, `templates/rpg-action-m1/template.yaml`, `README.md`.
- Test: quest count 2; modules include levels + transition; markers 8; minimum levels 2.
- Implement: two-level campaign; second enemy stronger; marker order; README.
- Commit.

### Task 5: Tests + full verification

- Files: `packages/core/test/fixtures.test.ts`, `m1-compose.test.ts`, `m0-compose.test.ts`, `packages/cli/test/create.test.ts`, `m0-verify.test.ts`.
- Test: 25 modules; new tokens; m1 markers 8; save sections include levels; content campaign copied; real M1 E2E sees all 8; m0/fixture unchanged.
- Run full tests, typecheck, build.
- Commit.

## Self-Review

- Spawn/queue_free lifecycle, autoplay termination, level marker order, save/load guard, m0 fallback.
- Deferred: real engine scene files per level, bosses, chapter map, screenshot/visual gate.

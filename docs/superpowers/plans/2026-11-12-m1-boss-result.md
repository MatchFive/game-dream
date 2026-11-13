# GameDream M1 Boss + Result Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Finish the M1 loop with a third boss level, victory/defeat result screens, and a real Restart that resets per-run state. Headless verification gets `GAMEDREAM_BOSS` and `GAMEDREAM_VICTORY`; desktop shows a result overlay with Restart/Quit.

**Architecture:** `campaign.json` gains a `throne` level with an `enemy.kind = boss`, scale, and 120 HP. Gameflow prints `GAMEDREAM_BOSS` on level 3 and `GAMEDREAM_VICTORY` on win; desktop emits `game.won`/`game.lost` and pauses, while headless keeps quitting after markers. `ui.result_screen` shows the overlay and emits `game.restart`; gameflow resets levels, enemy/player, health, inventory, progression, equipment, quests, and skills before rebuilding level 1.

**Tech Stack:** Existing Godot modules/content; no new engine dependencies.

## Global Constraints

- M1 markers: `BOOT_OK, MAP_OK, SPRITE_OK, DIALOGUE, LEVEL_UP, EQUIPPED, SKILL_CAST, LEVEL_2, BOSS, QUEST_COMPLETE, VICTORY, WIN`.
- Headless must still quit after `GAMEDREAM_VICTORY`; desktop must not auto-quit.
- Result screen must work while the tree is paused (`PROCESS_MODE_ALWAYS`).
- Restart must reset run state, not reload the process: levels, health, inventory, progression, equipment, quests, skills.
- M0/fixture have no result screen, no boss level, unchanged markers.
- Boss sprite uses the existing enemy sheet through a `boss` config; scale comes from level data.

## Review Focus

1. Boss level data/scale and marker order; quest completes on boss kill.
2. Victory/defeat UI only on desktop; headless quits cleanly.
3. Restart resets all run state and rebuilds level 1/map/enemy/player; no duplicate markers.
4. Result screen process mode and pause/unpause transitions.
5. M0/fixture compatibility and save/load behavior.

---

### Task 1: Boss content + markers

- Files: `templates/rpg-action-m1/content/levels/campaign.json`, `content/sprites/boss.json`, `content/quests/kill_slime.json`, `templates/rpg-action-m1/template.yaml`, README.
- Test: 3 levels, boss kind/HP/scale; quest count 3; markers 12; m0 unchanged.
- Implement: throne level, boss sprite config, scale handling, BOSS/VICTORY markers.
- Commit.

### Task 2: Result screen UI

- Files: `modules/ui.result_screen/**`, `templates/rpg-action-m1/template.yaml`.
- Test: manifest `ui_mounts`; script listens `game.won/lost/run.reset`; Restart emits `game.restart`.
- Implement: layer 45 overlay, title/summary, Restart/Quit, process always, pause on show.
- Commit.

### Task 3: Run reset + gameflow lifecycle

- Files: inventory/progression/equipment/quests/skills services, `system.gameflow/src/gameflow.gd`.
- Test: reset methods; gameflow new_game/restart; headless markers; no duplicate result.
- Implement: `reset()` per service; `_reset_run`; desktop pause/emit; headless quit; New Game calls reset.
- Commit.

### Task 4: Tests + full verification

- Files: `packages/core/test/fixtures.test.ts`, `m1-compose.test.ts`, `create.test.ts`, README.
- Test: 28 modules; result screen mount; 12 markers; real M1 E2E wins boss; m0/fixture.
- Run full tests, typecheck, build.
- Commit.

## Self-Review

- Boss kill/quest order, headless vs desktop quit, restart state, paused UI, markers, m0 compatibility.
- Deferred: boss phases/attacks, audio, VLM readability, multi-engine.

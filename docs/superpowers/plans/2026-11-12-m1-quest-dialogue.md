# GameDream M1 Quest + Dialogue Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Add data-driven quests and dialogue to the M1 project: an intro conversation, a kill quest, a quest tracker, a dialogue box, and two new headless markers. Multi-level/scene transitions are deferred to Plan 7.

**Architecture:** ContentDB loads `quests` and `dialogue` JSON. `system.quests` tracks auto-accepted kill quests and emits `quest.changed/completed`. `system.dialogue` plays line scripts and emits `dialogue.line/finished`. `ui.quest_tracker` shows active quests; `ui.dialogue_box` shows lines and a Next button. Gameflow plays the intro before autoplay and prints quest/dialogue markers.

**Tech Stack:** Existing composer + Godot 4.4 UI; JSON content; headless autoplay.

## Global Constraints

- Content stays in `game/content/{quests,dialogue}` and is user-owned; copy-if-missing only.
- Existing markers stay: `GAMEDREAM_BOOT_OK`, `GAMEDREAM_LEVEL_UP`, `GAMEDREAM_EQUIPPED`, `GAMEDREAM_SKILL_CAST`, `GAMEDREAM_WIN`.
- New M1 markers: `GAMEDREAM_QUEST_COMPLETE`, `GAMEDREAM_DIALOGUE` (appended before `GAMEDREAM_WIN` so existing missing-marker tests still see `LEVEL_UP` first).
- Dialogue must auto-advance in headless; desktop uses the Next button.
- Quest progress is driven by `enemy.died`; missing/non-dictionary payloads are ignored.
- `rpg-action-m0` and fixture keep working (no quest/dialogue services).

## Review Focus

1. ContentDB loads quests/dialogue and tolerates missing dirs/invalid JSON.
2. Quest completion must happen before win markers; no double completion.
3. Headless dialogue must not block autoplay forever; markers printed exactly once.
4. UI reads services; no hardcoded quest/dialogue text.
5. m0/fixture remain compatible (services optional).

---

### Task 1: ContentDB quests/dialogue

- Files: `modules/core.content/src/content_db.gd`, `api.md`, tests/content.
- Test: m1 content copies quest/dialogue JSON; ContentDB exposes `get_quest`, `get_dialogue`.
- Implement: load `quests` and `dialogue` dirs; add getters and public dictionaries.
- Commit.

### Task 2: `system.quests`

- Files: `modules/system.quests/**`, content `quests/kill_slime.json`.
- Test: manifest/source contain `enemy.died`, `quest.completed`, `completed_count`; template includes module.
- Implement: autoload order 45; auto-accept all quests; increment kill objectives; emit changed/completed; `get_active()`.
- Commit.

### Task 3: `system.dialogue`

- Files: `modules/system.dialogue/**`, content `dialogue/intro.json`.
- Test: manifest/source contain `dialogue.line`, `dialogue.finished`, `advance`; template includes module.
- Implement: autoload order 46; start/advance; line events; `is_active`.
- Commit.

### Task 4: Quest tracker + dialogue box UI

- Files: `modules/ui.quest_tracker/**`, `modules/ui.dialogue_box/**`.
- Test: manifests declare `ui_mounts`; sources contain `quest.changed`, `dialogue.line`; main scene mounts both.
- Implement: tracker label on layer 15; dialogue CanvasLayer on 35 with Next button; hidden until lines arrive.
- Commit.

### Task 5: Gameflow intro + markers

- Files: `modules/system.gameflow/src/gameflow.gd`, `templates/rpg-action-m1/template.yaml`.
- Test: m1 markers include quest/dialogue; m0 E2E still passes.
- Implement: `_ready` starts intro; headless advances to completion and prints `GAMEDREAM_DIALOGUE`; then autoplay. `_win` prints `GAMEDREAM_QUEST_COMPLETE` when `quests.completed_count > 0`.
- Commit.

### Task 6: Tests, docs, E2E

- Files: `packages/core/test/fixtures.test.ts`, `m1-compose.test.ts`, `packages/cli/test/create.test.ts`, `create-e2e.test.ts`, `README.md`.
- Test: module list/tokens; main scene includes tracker/dialogue; create E2E sees all seven markers; m0 still 2 markers.
- Run full suite, typecheck, build.
- Commit.

## Self-Review

- Content loading, quest completion order, dialogue termination, UI service reads, m0 compatibility.
- Deferred: multi-level/scene transitions, screenshots/visual gate, playtest DSL.

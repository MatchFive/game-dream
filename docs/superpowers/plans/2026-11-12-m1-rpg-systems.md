# GameDream M1 Data-Driven RPG Systems Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Add data-driven content and four RPG systems to the playable arena: ContentDB, progression, equipment, loot, and skills. The headless create E2E must print `GAMEDREAM_LEVEL_UP`, `GAMEDREAM_EQUIPPED`, `GAMEDREAM_SKILL_CAST`, and `GAMEDREAM_WIN`.

**Architecture:** A `core.content` autoload loads JSON from `game/content/{items,skills,loot}`. New services: `ProgressionService`, `EquipmentService`, `LootService`, `SkillService`. Enemy death emits `enemy.died`; progression/loot react; equipment auto-equips drops; player reads equipment bonuses and casts `ember_bolt`. Composer copies template content into `game/content/` only when files are missing. New `rpg-action-m1` template composes the full set.

**Tech Stack:** Existing TypeScript/Vitest/Zod composer; Godot 4.4 GDScript; JSON content; headless autoplay.

## Global Constraints

- `game/content/**` is user-owned: copy template content only if the file does not exist; never overwrite.
- Modules read content through `ContentDB` (`Game.get_service("content")`), not hardcoded item/skill tables.
- Headless markers: `GAMEDREAM_BOOT_OK`, `GAMEDREAM_LEVEL_UP`, `GAMEDREAM_EQUIPPED`, `GAMEDREAM_SKILL_CAST`, `GAMEDREAM_WIN`.
- `fixture-minimal` and `rpg-action-m0` keep working.
- No new UI screens, quests, dialogue, levels, or save in this plan (Plan 5).
- Autoplay remains deterministic; one terminal `GAMEDREAM_WIN`/`GAMEDREAM_LOSE`.

## Review Focus

1. Content copy must not overwrite user edits; missing/invalid JSON must degrade gracefully.
2. Autoload order: ContentDB before services; services before the main scene.
3. Enemy death event must be emitted before `queue_free`, so progression/loot/equipment run before win.
4. Marker assertions must come from the template manifest, not hardcoded.
5. Equipment bonuses must affect both attack and max HP without double-applying.

---

### Task 1: Template content copy + `core.content` ContentDB

- Files: `packages/core/src/composer/copy-template-content.ts`, `compose.ts`, `modules/core.content/{module.yaml,src/content_db.gd,api.md,skills/content.md,scenarios/load.yaml,tests/test_content_db.gd}`, `templates/*/content/**`, tests.
- Tests: compose `rpg-action-m1` → `game/content/items/rusty_sword.json` exists; edit it, recompose → preserved; manifest loads the module.
- Implement: recursive copy-if-missing; ContentDB autoload order 5 loads `items`, `skills`, `loot`; `get_item/get_skill/get_loot_table`; register service `content`.
- Commit.

### Task 2: `system.progression`

- Files: `modules/system.progression/**`, `fixtures/specs/m1.yaml`, tests.
- Tests: manifest/source contain `add_xp`, `leveled_up`, `enemy.died`; E2E marker later.
- Implement: service order 40; on `enemy.died` add 10 XP; level 1→2 at 10 XP; emits `leveled_up` and `changed`; serialize/deserialize.
- Commit.

### Task 3: `system.equipment` + HealthComponent max HP

- Files: `modules/system.equipment/**`, `modules/system.combat/src/health_component.gd`, `modules/system.player/src/player.gd`, tests.
- Tests: equipment service equips `rusty_sword` by slot, `get_bonus("attack_damage")` returns 5; player attack/max HP updates; no double-apply.
- Implement: service order 50; content-driven `equip(item_id)`; `get_equipped(slot)`, `get_bonus(stat)`; auto-equip empty slot on `loot.dropped`; `HealthComponent.set_max_hp`; player connects `equipment.changed`.
- Commit.

### Task 4: `system.loot`

- Files: `modules/system.loot/**`, `modules/system.ai/src/enemy.gd`, tests.
- Tests: loot table `slime` drops `rusty_sword`; enemy emits `enemy.died` before free; inventory gets item.
- Implement: service order 60; seeded RNG; reads `loot` table from ContentDB; emits `loot.dropped`.
- Commit.

### Task 5: `system.skills` + player skill input

- Files: `modules/system.skills/**`, `modules/system.player/module.yaml`, `player.gd`, tests.
- Tests: `skill_1` input action; skill cooldown; `ember_bolt` damages enemies in range; player calls service.
- Implement: service order 70; `cast(skill_id, caster)`; cooldown dictionary; content-driven damage/range/cooldown; emits `skill.cast`.
- Commit.

### Task 6: `rpg-action-m1` template, selector, E2E markers

- Files: `templates/rpg-action-m1/{template.yaml,content/**}`, `agent/src/classify/select-template.ts`, `cli` tests, `README.md`.
- Tests: selector prefers m1 over m0; create E2E sees all five markers; fake runner markers updated; m0/fixture unaffected.
- Implement: required modules + markers; m1 content; selector rules m1→m0; autoplay presses `skill_1`, win prints level/equip/skill markers.
- Run full suite, typecheck, build.
- Commit.

## Self-Review

- Content user-file safety, autoload ordering, event-before-free, marker-driven verify, bonus application.
- Deferred: UI screens, quests, dialogue, levels, save, playtest DSL, screenshots.

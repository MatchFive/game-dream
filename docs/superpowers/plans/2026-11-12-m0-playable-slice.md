# GameDream M0 Playable Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native) or subagent-driven-development. Steps use checkbox syntax.

**Goal:** Turn the generated fixture slice into a minimal playable arena: player moves with WASD, attacks, an enemy chases and attacks, health/death works, and headless autoplay proves `GAMEDREAM_WIN`.

**Architecture:** Add `system.combat`, `system.player`, `system.ai`, and `system.gameflow` Godot modules. Composer generates an input-map autoload, mounts the gameflow scene as the main gameplay scene, and drives verification from template acceptance markers. A new `rpg-action-m0` template composes the playable set. No menus, levels, assets, or M1 RPG systems.

**Tech Stack:** Existing TypeScript/Vitest/Zod composer; Godot 4.4 GDScript; headless autoplay.

**Spec:** `docs/superpowers/specs/2026-11-12-gamedream-design.md`

## Global Constraints

- Reuse Plan 1/2 boundaries: `modules/` and `game/_generated/` managed; `game/` user-owned.
- No MCP addon, no screenshots, no GdUnit4, no asset generation.
- Input actions are registered at runtime by `game/_generated/input_map.gd` (no hand-written `project.godot` input serialization).
- `verify` checks the markers declared by the template via `game.manifest.json`, not hardcoded strings.
- Headless autoplay must be deterministic and print exactly one of `GAMEDREAM_WIN` / `GAMEDREAM_LOSE`.
- Keep `fixture-minimal` working with its existing markers: `GAMEDREAM_BOOT_OK`, `INVENTORY_COUNT=1`.
- New M0 template markers: `GAMEDREAM_BOOT_OK`, `GAMEDREAM_WIN`.
- Windows first; UTF-8/LF; tests run offline except the Godot-gated E2E.

## Review Focus

1. **Verify false pass** — missing markers must fail G3; template markers must be read from the manifest.
2. **Input actions never registered** — `InputMapSetup` must run before player/enemy scripts; missing input must fail boot, not silently do nothing.
3. **Scene mounting** — main scene must mount the gameflow scene and HUD together; fixture (no gameflow) must keep its old behavior.
4. **Autoplay flakiness** — deterministic timings, one terminal marker, no double print, timeout guard.
5. **User files** — recompose/create must preserve `game/content/` and back up `gamedream.yaml` / `project.godot`.

---

## File Structure

```
packages/core/src/
  schemas/template.ts                 # acceptance_markers
  schemas/game-manifest.ts            # acceptance.markers
  schemas/module-manifest.ts          # main_scene + input_actions objects
  composer/generate-input-map.ts      # new
  composer/generate-main-script.ts    # new
  composer/generate-main-scene.ts     # gameflow + HUD
  composer/generate-project-godot.ts  # InputMapSetup autoload
  composer/write-game-manifest.ts     # markers
  composer/compose.ts                 # wire new outputs
modules/
  system.combat/                      # HealthComponent
  system.player/                      # player scene/script
  system.ai/                          # enemy scene/script
  system.gameflow/                    # game scene + autoplay + win/lose
  ui.hud/                             # HP label + event binding
templates/
  rpg-action-m0/template.yaml
```

---

### Task 1: Template acceptance markers and marker-driven verify

**Files:** `schemas/template.ts`, `schemas/game-manifest.ts`, `composer/write-game-manifest.ts`, `composer/compose.ts`, `cli/src/commands/verify.ts`, `tests`.

- [ ] **Test:** `parseTemplate` accepts `acceptance_markers`; `parseGameManifest` accepts `acceptance.markers`; verify fails when a declared marker is missing.
- [ ] **Implement:** add `acceptance_markers: string[]` default `['GAMEDREAM_BOOT_OK']` to template; add `acceptance: { markers: string[] }` default to game manifest; `writeGameManifest(outDir, managedFiles, markers)`; `composeProject` passes `plan.template.acceptance_markers`; `verifyCommand` checks every marker from the parsed game manifest.
- [ ] **Fixtures:** `fixture-minimal` markers `[GAMEDREAM_BOOT_OK, INVENTORY_COUNT=1]`; new `rpg-action-m0` later `[GAMEDREAM_BOOT_OK, GAMEDREAM_WIN]`.
- [ ] **Verify:** existing CLI tests still pass; missing-marker test asserts G3 fail.
- [ ] **Commit.**

### Task 2: Input action schema and generated input map

**Files:** `schemas/module-manifest.ts`, `composer/generate-input-map.ts`, `composer/generate-project-godot.ts`, `composer/compose.ts`, tests.

- [ ] **Test:** a module with `input_actions: [{name: move_left, keys: [A, LEFT]}]` produces `input_map.gd` containing `InputMap.add_action("move_left")` and `KEY_A`, and `project.godot` contains `InputMapSetup` before module autoloads.
- [ ] **Implement:** `input_actions` becomes `{ name: string; keys: string[] }[]`; generate `input_map.gd` with `_add(action, keys)` using `InputEventKey`; add `InputMapSetup="*res://game/_generated/input_map.gd"` after `Game`; write it to `game/_generated/` and include it in the managed manifest/files.
- [ ] **Commit.**

### Task 3: `system.combat` module

**Files:** `modules/system.combat/module.yaml`, `src/health_component.gd`, `api.md`, `skills/combat.md`, `tests/test_health_component.gd`.

- [ ] **Test:** fixture content test loads the manifest; GDScript source contains `take_damage`, `health_changed`, `died`.
- [ ] **Implement:** `HealthComponent` (`max_hp`, `hp`, `take_damage`, signals `health_changed(hp,max_hp)`, `died`). Manifest: `kind: system`, no autoload, `provides.components: [HealthComponent]`.
- [ ] **Commit.**

### Task 4: `system.player` module

**Files:** `modules/system.player/module.yaml`, `src/player.gd`, `scenes/player.tscn`, `api.md`, `skills/player.md`, `tests/test_player.gd`.

- [ ] **Test:** manifest declares input actions `move_left/right/up/down`, `attack`; scene contains `CharacterBody2D`, `Health` node; source contains `Input.get_vector`, `Input.is_action_just_pressed("attack")`, `take_damage`.
- [ ] **Implement:** `CharacterBody2D` with `Sprite2D` (colored placeholder), `CollisionShape2D`, `Health` child; movement speed 200; attack finds group `enemies` within 64 and calls `$Health.take_damage(10)`; emits `player.health_changed` / `player.died` events through `Game.events`.
- [ ] **Commit.**

### Task 5: `system.ai` module

**Files:** `modules/system.ai/module.yaml`, `src/enemy.gd`, `scenes/enemy.tscn`, `api.md`, `skills/ai.md`, `tests/test_enemy.gd`.

- [ ] **Test:** manifest/scene/source contain `enemy`, `move_and_slide`, `attack_damage`, `Health`.
- [ ] **Implement:** `CharacterBody2D` in group `enemies`; chase group `player` when distance > 40; attack every 1s for 5 damage; `Health.died` → `queue_free()`.
- [ ] **Commit.**

### Task 6: `system.gameflow` + HUD HP + main scene mounting

**Files:** `modules/system.gameflow/module.yaml`, `src/gameflow.gd`, `scenes/game.tscn`, `modules/ui.hud/src/hud.gd`, `scenes/hud.tscn`, `composer/generate-main-scene.ts`, `composer/generate-main-script.ts`, `composer/compose.ts`, tests.

- [ ] **Test:** main scene includes the gameflow scene and HUD; fixture (no gameflow) stays HUD-only; generated `main.gd` prints `GAMEDREAM_BOOT_OK` and only quits when there is no game scene; HUD source contains `hp_label`.
- [ ] **Implement:** gameflow scene with player at (320,240), enemy at (600,240); connect health died to win/lose; headless autoplay presses `move_right` then `attack` three times; print exactly one `GAMEDREAM_WIN` or `GAMEDREAM_LOSE` and quit 0. HUD adds `HP: hp/max` label bound to `player.health_changed`.
- [ ] **Commit.**

### Task 7: `rpg-action-m0` template and selector

**Files:** `templates/rpg-action-m0/template.yaml`, `agent/src/classify/select-template.ts`, tests.

- [ ] **Test:** action-RPG prompt selects `rpg-action-m0` when present; fixture remains fallback; template has the playable required modules and markers.
- [ ] **Implement:** required modules: `core.events`, `core.stats`, `system.combat`, `system.player`, `system.ai`, `system.gameflow`, `system.inventory`, `ui.hud`; `acceptance_markers: [GAMEDREAM_BOOT_OK, GAMEDREAM_WIN]`; selector rule for `rpg` prefers `rpg-action-m0`.
- [ ] **Commit.**

### Task 8: Playable create E2E and docs

**Files:** `packages/cli/test/create-e2e.test.ts` (extend), `README.md`.

- [ ] **Test:** create with the fake provider and real Godot → verify all gates pass; G3 sees `GAMEDREAM_WIN`; a second create preserves `game/content`.
- [ ] **Run:** full suite + typecheck + build.
- [ ] **Docs:** note the playable slice and M0 controls (WASD + J/Space), headless win marker.
- [ ] **Commit.**

---

## Self-Review

- Spec coverage: M0 move/attack/enemy/health/win markers.
- Tests: marker-driven verify; input map; modules content; main scene; selector; E2E.
- Deferred: menus, restart UI, levels, save, GdUnit4/playtest DSL, screenshots, M1 RPG systems.

# GameDream M1 Audio + Settings Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Add procedural audio and a settings menu: music/SFX buses, event-driven sound effects, persisted music/SFX volume and fullscreen, and a settings overlay reachable from the main and pause menus. M1 gets `GAMEDREAM_AUDIO_OK`.

**Architecture:** `system.settings` stores `music_volume`, `sfx_volume`, `fullscreen` in `user://settings.json` and applies buses/fullscreen. `system.audio` creates Music/SFX buses, generates WAV tones/music at runtime (no assets), plays SFX on game events, and starts looping music. `ui.settings` provides sliders/checkbox and is opened by `settings.open` events from main/pause menus. Gameflow reports the audio service once.

**Tech Stack:** Godot 4.4 `AudioStreamWAV`/`AudioServer`; existing settings/content/UI modules.

## Global Constraints

- No external audio assets; streams are generated at runtime.
- Settings persist atomically and survive restart; headless skips fullscreen changes.
- Audio/settings are optional for M0/fixture; no audio module there.
- M1 markers add `GAMEDREAM_AUDIO_OK` after `GAMEDREAM_SPRITE_OK`.
- Settings UI works while the tree is paused (`PROCESS_MODE_ALWAYS`); Back only closes it.
- Settings are user-owned (`user://settings.json`), independent of save slots.

## Review Focus

1. Bus creation/volume application and headless safety.
2. Generated WAV validity, event-driven SFX, loop boundaries.
3. Settings persistence/atomicity and fullscreen behavior.
4. Settings UI pause/process mode and menu entry points.
5. M0/fixture compatibility and marker order.

---

### Task 1: Settings service

- Files: `modules/system.settings/**`.
- Test: manifest/service source tokens; defaults; load/save/apply.
- Implement: JSON load/save, setters, bus/fullscreen apply, changed signal.
- Commit.

### Task 2: Audio service

- Files: `modules/system.audio/**`.
- Test: bus/stream tokens `AudioStreamWAV`, `AudioServer`, `play_sfx`; event hooks.
- Implement: generated tones/music, player pool, event mapping, settings sync.
- Commit.

### Task 3: Settings UI + menu entries

- Files: `modules/ui.settings/**`, main/pause menu scenes/scripts.
- Test: mount layer 44; tokens `settings.open`, sliders, fullscreen; menu buttons.
- Implement: overlay, sync, apply; Settings buttons.
- Commit.

### Task 4: Markers/template/tests/docs

- Files: `system.gameflow`, template, tests, README.
- Test: `GAMEDREAM_AUDIO_OK`; M1 markers 13; M0 no audio/settings.
- Run full tests, typecheck, build.
- Commit.

## Self-Review

- WAV generation/loop, settings atomic write, paused UI, headless marker, m0 compatibility.
- Deferred: real music/audio assets, mute hotkey, audio bus effects, localization.

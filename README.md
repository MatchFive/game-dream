# GameDream

AI game development assistant. Plan 1 implements the deterministic core + Godot vertical slice:
a fixture GameSpec + template is composed into a bootable Godot project with four local modules,
and verified with a real headless boot/inventory check. Plan 2 adds prompt → GameSpec drafting,
genre template selection, and the `dream create` command.

## Prerequisites

- Node.js 22+
- pnpm via corepack (`corepack enable`)
- Godot 4.4+ — set `GODOT_BIN` to the **console** executable:
  - Windows: `C:\path\to\Godot_v4.4.1-stable_win64_console.exe`
  - Linux/macOS: the `godot` binary

## Commands

```bash
corepack pnpm install
corepack pnpm test

corepack pnpm exec tsx packages/cli/src/index.ts doctor

corepack pnpm exec tsx packages/cli/src/index.ts compose \
  --spec fixtures/specs/minimal.yaml \
  --out "tmp/my-game" \
  --modules modules \
  --templates templates

corepack pnpm exec tsx packages/cli/src/index.ts verify --path "tmp/my-game"
```

Expected verify output:

```
G1: pass
G2: pass
G3: pass
```

`G1` validates the lockfile and generated game manifest. `G2` imports the project with
Godot. `G3` boots it headlessly and checks the `GAMEDREAM_BOOT_OK` and
`INVENTORY_COUNT=1` markers. If Godot is not found, `G2`/`G3` report `skip` — never a
false pass.

## One-command create

```bash
# offline deterministic provider (no API key)
corepack pnpm exec tsx packages/cli/src/index.ts create \
  "做一个俯视角动作 RPG，有背包和 1 个敌人" \
  --out "tmp/my-game" \
  --provider fake \
  --modules modules \
  --templates templates

# review the plan without writing anything
corepack pnpm exec tsx packages/cli/src/index.ts create \
  "做一个俯视角动作 RPG" \
  --out "tmp/plan-only" \
  --provider fake \
  --mode dry-run \
  --modules modules \
  --templates templates
```

`--provider auto` uses the OpenAI-compatible provider when `OPENAI_API_KEY` is set,
otherwise the deterministic fake provider. Real-model runs also read `OPENAI_BASE_URL`
and `GAMEDREAM_MODEL`. `--mode dry-run` writes nothing; `--no-verify` skips Godot
verification.

## Playable M0 slice

Action-RPG prompts now select the `rpg-action-m1` template: a five-level campaign
through forest, shrine, throne, and sanctum maps with slime/wisp/guardian
variants and a final boss, tile maps, animated sprites, a player,
health/combat, progression, loot, equipment, a skill, quests, and dialogue. Desktop controls:
**WASD** move, **J / Space** attack, **K** cast Ember Bolt.
Headless autoplay prints `GAMEDREAM_MAP_OK`, `GAMEDREAM_SPRITE_OK`,
`GAMEDREAM_AUDIO_OK`, `GAMEDREAM_DIALOGUE`, `GAMEDREAM_LEVEL_UP`, `GAMEDREAM_EQUIPPED`,
`GAMEDREAM_SKILL_CAST`, `GAMEDREAM_LEVEL_2`, `GAMEDREAM_BOSS`,
`GAMEDREAM_BOSS_PHASE`, `GAMEDREAM_QUEST_COMPLETE`, `GAMEDREAM_VICTORY`, and
`GAMEDREAM_WIN`. The intro
dialogue, slime/wisp/guardian/boss kill quests, five-level campaign, maps, and sprite configs come
from `game/content/dialogue`, `game/content/quests`, `game/content/levels`,
`game/content/maps`, and `game/content/sprites`; the quest tracker is always on.

On desktop, winning or losing opens a result screen with **Restart** and **Quit**.
Restart resets levels, health, inventory, progression, equipment, quests, and
skills, then rebuilds level 1.

UI controls: **I** inventory, **C** equipment, **L** skills, **Esc** pause.
The pause menu saves to `user://save.json`; the main and pause menus open
**Settings**. The main menu offers New Game / Continue on desktop. Headless runs
hide the menu and autoplay.

## Audio and settings

`system.audio` generates music and SFX at runtime (no audio assets), routes them
through Music/SFX buses, and plays hit/pickup/level/skill/quest/win/lose/dialogue
sounds. `system.settings` persists music volume, SFX volume, and fullscreen in
`user://settings.json`; `ui.settings` exposes sliders and a fullscreen toggle
from both menus. M1 prints `GAMEDREAM_AUDIO_OK`.

Content is data-driven under `game/content/`:

- `items/*.json` — item id, slot, stat bonuses
- `skills/*.json` — damage, range, cooldown
- `loot/*.json` — enemy kind → drop table
- `quests/*.json` — slime/wisp/guardian/boss kill objectives with XP rewards
- `dialogue/*.json` — speaker lines
- `levels/*.json` — per-level map id, enemy stats, and positions
- `maps/*.json` — tile rows (`#` wall, `.` floor), colors, and tile size
- `sprites/*.json` — texture path, frame size, and idle/move/attack ranges

The composer copies template content only when a file does not already exist, so
user edits survive recompose. Existing projects keep their old `campaign.json`
(including its level count); re-create into a fresh directory to pick up the M2
five-level campaign, or merge `levels/campaign.json`, `maps/shrine.json`,
`maps/sanctum.json`, `quests/kill_wisp.json`, `quests/kill_guardian.json`,
`sprites/wisp.json`, `sprites/guardian.json`, and the new AI assets manually.
`rpg-action-m0` and `fixture-minimal` remain available as smaller templates.

## Screenshots and G6

Generated projects include a no-op `ScreenshotCapture` autoload. It only activates
with `--screenshot`, starts a new game, waits 60 frames, captures the viewport to
`user://screenshot.png`, and prints path/metrics.

- `dream screenshot --path ./my-game` — copy the PNG to
  `game/screenshots/screenshot.png` (or `--out`).
- `dream verify --path ./my-game --visual` — run G6 with the same capture.
  G6 requires a windowed Godot run (no `--headless`), at least 640×360 output,
  ≥5% non-black samples, ≥8 distinct colors, and ≥4 center-region colors. Use
  `--screenshot-out` to choose the PNG path.
- `dream verify --path ./my-game --visual --vision fake` — additionally review
  HUD/player/enemy/dialogue readability. `--vision openai` uses
  `OPENAI_API_KEY` and the OpenAI-compatible vision API (`GAMEDREAM_VISION_MODEL`
  defaults to `gpt-4o-mini`). `--vision` implies `--visual`.

G6 is opt-in so headless CI keeps running G1–G3. Golden-image diffing and
multi-frame review are deferred. `--vision fake` keeps the image local;
`--vision openai` uploads it to the configured vision endpoint.

## Unity 2D M0

```bash
dream unity compose --out ./unity-game --content templates/rpg-action-m1/content
dream unity verify --path ./unity-game
dream unity verify --path ./unity-game --runtime
dream unity verify --path ./unity-game --runtime --unity "D:\unity\6000.6.9f1\Editor"
dream unity build --path ./unity-game
dream unity build --path ./unity-game --target webgl
dream unity webgl-check --path ./unity-game/Builds/WebGL
dream unity smoke --path ./unity-game
dream unity screenshot --path ./unity-game
```

`unity compose` generates a Unity 6 (`6000.x`) source project with a pure C#
`GameSim`, runtime bootstrap, and `EditorVerifier`. With `--content` it embeds the
same five-level campaign, maps, quests, items and loot used by Godot/Web; item
slot/bonuses are auto-equipped, and player builds save inventory/equipment/
level/quests under `Application.persistentDataPath` (headless verification and
editor screenshots never load saves). Without content, the M0 single-arena
fallback is used. No Unity binary is bundled.
`unity verify` is a fast static file/marker check. `--runtime` launches
`Unity.exe -batchmode -quit -projectPath <dir> -executeMethod EditorVerifier.Run
-logFile -` and requires `UNITY_SIM_OK` + `UNITY_WIN`; it auto-detects common
Unity Hub installs or uses `UNITY_BIN` / `--unity`. Exit codes: 0 pass, 1
static/runtime marker failure, 3 Unity missing.

Play mode prints `UNITY_BOOT_OK`, then `UNITY_WIN` or `UNITY_LOSE`. Headless
`EditorVerifier` prints `UNITY_SIM_OK`, then `UNITY_WIN`, `UNITY_LOSE`, or
`UNITY_TIMEOUT`; M1 content additionally requires `UNITY_MAP_OK`,
`UNITY_QUEST_COMPLETE`, `UNITY_BOSS_PHASE`, `UNITY_LOOT_OK`, and
`UNITY_SAVE_OK`. It does not boot the scene, so a pass is not a screenshot.
Open the project in Unity and press Play to use the runtime bootstrap (no scene
asset is required).

`unity build` generates/updates `Assets/Scenes/Main.unity` and
`ProjectSettings/EditorBuildSettings.asset`, then writes a Windows player
(default `Builds/Windows/GameDream.exe`). `unity screenshot` enters play mode,
renders the arena to a PNG, and exits. Both require a fresh output file and
`UNITY_BUILD_OK` / `UNITY_SCREENSHOT_OK`; use a short project path on Windows to
avoid Unity's long-path build issues. `--target webgl` requires a fresh
`index.html` + `Build/` directory. WebGL is built with compression disabled, so
serve `Builds/WebGL` over HTTP (for example `python -m http.server`) rather than
opening `index.html` via `file://`. `unity webgl-check` serves the directory,
loads it in headless Chrome/Edge, and requires a non-blank 1280×720 screenshot. `unity smoke` launches the built exe with
`GAMEDREAM_SMOKE_OUT=1` and requires `UNITY_BOOT_OK` + `UNITY_SMOKE_OK` in its
log; a player without a matching build stamp is rejected.

## Web M0 (Phaser)

The second engine track is a Web M0 prototype: a pure ESM simulation plus a
vendored Phaser 3 renderer and keyboard controls. `dream web compose` writes
`index.html`, `style.css`, `sim.mjs`, `sim-run.mjs`, `save.mjs`, `settings.mjs`,
`camera.mjs`, `game.js`, `game.json`, and `vendor/phaser.min.js`; `dream web verify` runs the deterministic simulation and checks
`WEB_BOOT_OK`/`WEB_WIN`. Serve the generated directory over HTTP (ES modules and
`fetch` do not work from `file://`); the generated `README.md` shows the command.
The generated project vendors `vendor/phaser.min.js`; the simulation contract
remains browser- and headless-compatible.

- `dream web compose --out ./web-game [--force]`
- `dream web compose --out ./web-game --content templates/rpg-action-m1/content --modules modules`
  embeds the five levels, maps, quests, enemy variants, and player/enemy/boss/wisp/guardian SVG assets.
- `dream web verify --path ./web-game` requires `WEB_MAP_OK`/`WEB_QUEST_COMPLETE`
  when the embedded config has levels/quests, and `WEB_BOSS_PHASE` when a boss
  level is embedded.
- `dream web verify --path ./web-game --visual` captures a 1280×720 real browser
  screenshot and checks non-black pixels/colors. Set `GAMEDREAM_BROWSER` if
  Chrome/Edge is not auto-detected. Exit codes: 0 pass, 1 infrastructure,
  2 visual gate, 3 browser missing.
- `dream web screenshot --path ./web-game [--out ./web.png] [--width 1280] [--height 720]`
  captures the page without running the marker gate.
- The generated game saves level/HP/inventory/quests in localStorage, offers
  `O` settings, `P` pause, `R` reset, and runtime WebAudio music/SFX with
  persisted volumes. The camera follows the player with map bounds (desktop ~1.2×,
  mobile ~2×), and coarse-pointer/narrow viewports get touch D-pad, attack,
  panel, and pause controls with a responsive canvas/panel layout.
- `dream web package --path ./web-game --out ./release/web-game` checks required
  files and writes a deployable static directory plus `deployment.json` with
  content sizes/SHA-256 hashes (the manifest itself is excluded). See
  [docs/deploy-web.md](docs/deploy-web.md).

## Godot release

- `dream godot package --path ./game --out ./release/game-source` copies a clean
  source release (modules/game/content/presets) with `release.json` hashes.
- `dream godot export --path ./game --preset "Windows Desktop" --out ./build/game.exe`
  runs a native export when matching Godot 4.4 export templates are installed.
  Missing templates exit 3 with guidance. `dream godot templates` reports the
  expected directory/platforms. See [docs/release-godot.md](docs/release-godot.md)
  and [docs/ci.md](docs/ci.md).

## Prompt evaluation

`dream eval` runs 20 prompt → GameSpec → template cases from
`fixtures/eval/prompts.json`. The default fake provider is deterministic and needs
no API key; each case checks genre and template. `--provider openai` runs the same
cases against the configured model. Use `--fixtures`, `--templates`, and `--json`
to override paths/output.

## Tiled maps

Internal maps use rows (`#` wall, `.` floor). Tiled JSON `.tmj` uses gid `1` =
floor and `2` = wall; colors and id round-trip through Tiled custom properties.
Import expects the 2-tile GameDream sheet with `firstgid: 1` and CSV/uncompressed
layers; infinite and base64/compressed maps are rejected.

- `dream map export --map game/content/maps/clearing.json --out clearing.tmj`
  writes the `.tmj` and a generated `clearing.png` tileset sheet. Use `--force` to
  overwrite existing files.
- `dream map import --tmj clearing.tmj --out game/content/maps/clearing.json`
  restores the internal map; `--id/--floor/--wall/--layer/--force` override Tiled
  data. Colors are canonicalized to lowercase 6-digit hex.

## Generated project layout

- `modules/` — managed by the composer; do not edit
- `project.godot` — composer-managed merge: only autoloads and the main scene are
  rewritten; other sections are preserved and a `.bak` is written on recompose
- `game/_generated/` — composer-owned main scene, service locator, and UI mounts
- `game/content/`, `game/config/`, `game/scripts/`, `game/ui/`, `game/tests/` —
  user-owned; the composer never overwrites these
- `game/game.manifest.json` — managed/user ownership and hashes

## Fixture modules

- `core.events` — event bus
- `core.stats` — numeric stats service
- `system.inventory` — inventory service with signals and save serialization
- `ui.hud` — HUD scene bound to inventory count

## Release artifacts

Manual `workflow_dispatch` (or a `v*` tag) builds three engine artifacts from the
shared M1 content:

- `gamedream-web-release` — verified/package Web build
- `gamedream-godot-release` — packaged Godot source project with `release.json`
- `gamedream-unity-release` — statically verified Unity source project
- `gamedream-release-manifest` — path/bytes/SHA-256 for every artifact file

Unity/Godot release jobs require no Unity/Godot binary; runtime acceptance remains
an opt-in local step (`UNITY_BIN`, `GODOT_BIN`). UE is intentionally out of scope.

For local release acceptance, pass already-built project directories:

```bash
pnpm build
pnpm release:accept \
  --web ./web-game \
  --godot ./godot-game \
  --unity-dir ./unity-game \
  --godot-bin "$GODOT_BIN" \
  --unity-bin "$UNITY_BIN"
```

The script writes `dist/release-acceptance/<timestamp>/acceptance.json` with each
engine's verify/package/runtime commands, exit codes, artifacts, and skipped-runtime
reasons. `--skip-runtime` performs static/package checks only.

## Docs

- Design spec: `docs/superpowers/specs/2026-11-12-gamedream-design.md`
- Plan 1 (core + Godot slice): `docs/superpowers/plans/2026-11-12-core-godot-vertical-slice.md`
- Plan 2 (agent runtime + create): `docs/superpowers/plans/2026-11-12-agent-runtime-create.md`
- Technical research: `docs/architecture.md`

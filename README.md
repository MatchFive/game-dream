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

Action-RPG prompts now select the `rpg-action-m1` template: a single arena with a
player, one enemy, health/combat, progression, loot, equipment, and a skill.
Desktop controls: **WASD** move, **J / Space** attack, **K** cast Ember Bolt.
Headless autoplay prints `GAMEDREAM_DIALOGUE`, `GAMEDREAM_LEVEL_UP`,
`GAMEDREAM_EQUIPPED`, `GAMEDREAM_SKILL_CAST`, `GAMEDREAM_QUEST_COMPLETE`, and
`GAMEDREAM_WIN`. The intro dialogue and kill quest come from
`game/content/dialogue` and `game/content/quests`; the quest tracker is always on.

UI controls: **I** inventory, **C** equipment, **L** skills, **Esc** pause.
The pause menu saves to `user://save.json`; the main menu offers New Game /
Continue on desktop. Headless runs hide the menu and autoplay.

Content is data-driven under `game/content/`:

- `items/*.json` — item id, slot, stat bonuses
- `skills/*.json` — damage, range, cooldown
- `loot/*.json` — enemy kind → drop table

The composer copies template content only when a file does not already exist, so
user edits survive recompose. `rpg-action-m0` and `fixture-minimal` remain available
as smaller templates.

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

## Docs

- Design spec: `docs/superpowers/specs/2026-11-12-gamedream-design.md`
- Plan 1 (core + Godot slice): `docs/superpowers/plans/2026-11-12-core-godot-vertical-slice.md`
- Plan 2 (agent runtime + create): `docs/superpowers/plans/2026-11-12-agent-runtime-create.md`
- Technical research: `docs/architecture.md`

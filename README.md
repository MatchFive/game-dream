# GameDream

AI game development assistant. Plan 1 implements the deterministic core + Godot vertical slice:
a fixture GameSpec + template is composed into a bootable Godot project with four local modules,
and verified with a real headless boot/inventory check.

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
- Implementation plan: `docs/superpowers/plans/2026-11-12-core-godot-vertical-slice.md`
- Technical research: `docs/architecture.md`

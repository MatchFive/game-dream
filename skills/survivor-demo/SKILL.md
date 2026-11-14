# Survivor Demo Skill

Use this skill when the prompt asks for a Vampire Survivors-like game, survivor
demo, auto-attacking swarm game, or a 60-second arena run.

## Output contract

Build a Godot project in the requested output directory. The project must pass
G1/G2/G3 and expose these markers:

- `GAMEDREAM_SURVIVOR_SPAWN`
- `GAMEDREAM_SURVIVOR_LEVEL`
- `GAMEDREAM_UPGRADE`
- `GAMEDREAM_BOSS`
- `GAMEDREAM_BOSS_PHASE`
- `GAMEDREAM_WIN`

## Preferred path

1. Call the `scaffold` tool with this skill's kit.
2. Call `verify` to establish a baseline.
3. Edit gameplay source under `.gamedream/modules/` (or template markers under
   `.gamedream/templates/`), then call `compose` to regenerate the project.
4. Call `check_script` on each modified generated `.gd` file, then `verify`;
   inspect failures, patch, and repeat.
5. Call `finish` only after verification passes.

Do not edit generated `modules/` or `game/_generated/` directly; those are
composer output. The kit under `.gamedream/` is the source of truth.

## Demo requirements

- WASD movement in a top-down arena.
- Automatic bolt/aura/nova weapons.
- Crawlers and brutes, XP gems, level-up choices, boss at 40 seconds.
- Boss half-HP phase.
- 60-second survival goal and readable HUD.

The kit is a starting point, not a ceiling. Keep the markers intact when
changing content, balance, visuals, or timing.

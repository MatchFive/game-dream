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
2. Call `verify`.
3. If a gate fails, read the failure, edit the generated project with
   `write_file`, and verify again.
4. Call `finish` only after verification passes.

## Demo requirements

- WASD movement in a top-down arena.
- Automatic bolt/aura/nova weapons.
- Crawlers and brutes, XP gems, level-up choices, boss at 40 seconds.
- Boss half-HP phase.
- 60-second survival goal and readable HUD.

The kit is a starting point, not a ceiling. Keep the markers intact when
changing content, balance, visuals, or timing.

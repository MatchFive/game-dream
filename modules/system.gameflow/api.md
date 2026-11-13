# system.gameflow

## Main scene
- `scenes/game.tscn` — `MapRoot`, `Player`, plus `EnemyRoot`.

## Services
- Optional `Game.get_service("levels")`; without it, one default enemy is spawned.
- Optional `Game.get_service("maps")`; builds the current level's tile map under
  `MapRoot` and prints `GAMEDREAM_MAP_OK` once per run.
- Optional `Game.get_service("sprites")`; prints `GAMEDREAM_SPRITE_OK` after both
  player and enemy sprites are applied (once per process).

## Behavior
- Spawns an enemy under `EnemyRoot` from `levels.current_level().enemy`, or defaults
  (`slime`, 30 HP, 5 damage, speed 80, at 600×240). Spawns inside walls snap to the
  first floor cell; the player is also snapped if a level change puts it in a wall.
- Connects enemy `Health.died` to level advance or win; heals the player on level change.
- Desktop: no autoplay; `game.started` starts the intro dialogue; New Game resets levels.
- Headless autoplay: moves toward the enemy on both axes, attacks, and runs at most
  900 physics frames before reporting `GAMEDREAM_LOSE`.

## Markers
`GAMEDREAM_MAP_OK`, `GAMEDREAM_SPRITE_OK`, `GAMEDREAM_DIALOGUE`,
`GAMEDREAM_LEVEL_UP`, `GAMEDREAM_EQUIPPED`, `GAMEDREAM_SKILL_CAST`,
`GAMEDREAM_LEVEL_2`, `GAMEDREAM_BOSS`, `GAMEDREAM_QUEST_COMPLETE`,
`GAMEDREAM_VICTORY`, `GAMEDREAM_WIN`, `GAMEDREAM_LOSE`.

# system.roguelike

## Behavior

- Deterministic seeded maze dungeon with walls, floors, enemies, and an exit.
- Turn-based grid movement; bumping an enemy attacks it.
- Enemies chase and attack the player.
- One life only: zero HP prints `GAMEDREAM_LOSE` and exits.
- A generated dungeon prints `GAMEDREAM_DUNGEON`; kills print
  `GAMEDREAM_KILL`; reaching the exit prints `GAMEDREAM_WIN`.
- Headless mode uses BFS to fight and escape for CI verification.

## Inputs

`move_left`, `move_right`, `move_up`, `move_down`, `restart`.

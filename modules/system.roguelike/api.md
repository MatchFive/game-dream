# system.roguelike

## Behavior

- Deterministic seeded maze dungeon with walls, floors, enemies, and an exit.
- Three rooms per run: Entry Hall, Ash Market, and Vault. Room seeds derive from
  the base seed; the market adds a cache and buys `ember` when affordable; the
  vault adds an ambush. Clearing the Vault exits the run.
- Turn-based grid movement; bumping an enemy attacks it.
- Enemies chase and attack the player.
- One life only: zero HP prints `GAMEDREAM_LOSE` and exits.
- A generated dungeon prints `GAMEDREAM_DUNGEON`; kills print
  `GAMEDREAM_KILL`; room transitions print `GAMEDREAM_ROOM`, events print
  `GAMEDREAM_CACHE`/`GAMEDREAM_AMBUSH`, and relic purchase prints
  `GAMEDREAM_RELIC`.
- Headless mode uses BFS to fight and escape for CI verification.

## Inputs

`move_left`, `move_right`, `move_up`, `move_down`, `restart`.

# system.puzzle

## Behavior

- Sokoban board with walls, targets, boxes, and a player.
- WASD moves and pushes one box at a time.
- Pushing a box prints `GAMEDREAM_PUSH`; completing all targets advances the
  level.
- Two levels; clearing both prints `GAMEDREAM_WIN`.
- Headless mode uses BFS over player/box states to solve both levels for CI.

## Inputs

`move_left`, `move_right`, `move_up`, `move_down`, `restart`.

# Using system.puzzle

- The module owns `scenes/board.tscn`; it is mounted as the game scene.
- Levels are ASCII grids in `src/board.gd`; `#` wall, `.` target, `$` box,
  `@` player.
- Rendering uses `_draw`; no external assets are required.

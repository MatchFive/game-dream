# Using system.gameflow

- The composer mounts `scenes/game.tscn` as the main gameplay scene.
- `EnemyRoot` is filled from `system.levels`; without levels it uses one default enemy.
- Enemy death advances levels or wins. New Game resets the level index.
- Win/lose markers are `GAMEDREAM_WIN` / `GAMEDREAM_LOSE`; level two prints
  `GAMEDREAM_LEVEL_2`.

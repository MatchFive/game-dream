# Using system.gameflow

- The composer mounts `scenes/game.tscn` as the main gameplay scene.
- `EnemyRoot` is filled from `system.levels`; without levels it uses one default enemy.
- `MapRoot` is filled from `system.map` and the level's `map` id.
- `GAMEDREAM_SPRITE_OK` is printed after player and enemy sprites are applied.
- `GAMEDREAM_AUDIO_OK` is printed after the audio service initializes.
- Enemy death advances levels or wins. New Game / Restart resets the run.
- Level two prints `GAMEDREAM_LEVEL_2`; `GAMEDREAM_BOSS` prints when the current
  level enemy kind is `boss` (the final M2 level).
- Desktop win/lose shows the result screen; headless prints
  `GAMEDREAM_VICTORY` / `GAMEDREAM_LOSE` and quits.

# system.gameflow

## Main scene
- `scenes/game.tscn`

## Behavior
- Instances the player and one enemy.
- Connects health `died` to win/lose.
- Headless autoplay: move right, attack three times, then print `GAMEDREAM_WIN` or `GAMEDREAM_LOSE` and quit.
- Desktop: no autoplay; the player controls the scene.

# system.survivor

## Behavior

- Top-down survivor arena with continuous enemy spawns.
- Auto-attacks the nearest enemy; killing enemies grants XP.
- XP levels increase damage.
- Survive the timer to print `GAMEDREAM_WIN`; zero HP prints
  `GAMEDREAM_LOSE`.
- First spawn prints `GAMEDREAM_SURVIVOR_SPAWN`; first level-up prints
  `GAMEDREAM_SURVIVOR_LEVEL`.
- Headless mode stands and auto-attacks for CI verification.

## Inputs

`move_left`, `move_right`, `move_up`, `move_down`, `restart`.

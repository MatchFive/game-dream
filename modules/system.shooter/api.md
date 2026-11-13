# system.shooter

## Behavior

- Top-down arena movement with clamped bounds.
- Space/J fires at the nearest enemy; enemies chase the player.
- Three waves of three enemies; each wave start prints `GAMEDREAM_WAVE`.
- Killing the first enemy prints `GAMEDREAM_KILL`; clearing the final wave
  prints `GAMEDREAM_WIN`.
- Headless mode auto-fires and clears all waves for CI verification.

## Inputs

`move_left`, `move_right`, `move_up`, `move_down`, `attack`, `restart`.

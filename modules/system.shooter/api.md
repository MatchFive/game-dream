# system.shooter

## Behavior

- Top-down arena movement with clamped bounds.
- Space/J fires at the nearest enemy; enemies chase the player.
- Killing the first enemy prints `GAMEDREAM_KILL`; clearing the arena prints
  `GAMEDREAM_WIN`.
- Headless mode auto-fires and clears the arena for CI verification.

## Inputs

`move_left`, `move_right`, `move_up`, `move_down`, `attack`, `restart`.

# system.platformer

## Behavior

- Side-view kinematic player with gravity, horizontal movement, and jump.
- Three stage goals: Rooftops, Foundry, and Skyline. Each goal advances the stage
  and prints `GAMEDREAM_STAGE=2/3`; the final goal prints `GAMEDREAM_WIN`.
  Falling prints `GAMEDREAM_LOSE`.
- Static platforms and nine coins; collecting the first coin prints
  `GAMEDREAM_COIN`.
- Headless mode auto-runs right so CI can verify the level.

## Inputs

`move_left`, `move_right`, `jump`, `restart`.

# system.platformer

## Behavior

- Side-view kinematic player with gravity, horizontal movement, and jump.
- Static platforms and three coins; collecting a coin prints `GAMEDREAM_COIN`.
- Reaching the goal prints `GAMEDREAM_WIN`; falling prints `GAMEDREAM_LOSE`.
- Headless mode auto-runs right so CI can verify the level.

## Inputs

`move_left`, `move_right`, `jump`, `restart`.

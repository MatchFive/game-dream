# system.tower_defense

## Behavior

- Enemies follow a fixed path toward the base.
- `build` places the next tower; `upgrade` improves a built tower.
- `start_wave` starts the next wave; towers shoot automatically.
- Three waves; clearing all of them prints `GAMEDREAM_WIN`.
- Losing all base HP prints `GAMEDREAM_LOSE`.
- Headless mode builds, upgrades, and starts waves automatically for CI.

## Inputs

`build`, `upgrade`, `start_wave`, `restart`.

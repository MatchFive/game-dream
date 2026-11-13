# system.player

## Components
- `Player` (`src/player.gd`)

## Input
- `move_left`, `move_right`, `move_up`, `move_down`, `attack`

## Behavior
- Moves at `speed` with `Input.get_vector`.
- Attacks enemies in group `enemies` within `attack_range` for `attack_damage`.
- Emits `player.health_changed` and `player.died` on the event bus.

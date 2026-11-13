# system.player

## Components
- `Player` (`src/player.gd`)

## Input
- `move_left`, `move_right`, `move_up`, `move_down`, `attack`, `skill_1`

## Behavior
- Moves at `speed` with `Input.get_vector`.
- Attacks enemies in group `enemies` within `attack_range` for `attack_damage`.
- Reads `attack_damage` and `max_hp` bonuses from `Game.get_service("equipment")`.
- When `system.sprites` is present, applies `player` and plays `idle`/`move`/`attack`;
  otherwise the Polygon2D fallback stays visible.
- When `system.skills` is present, `skill_1` casts `ember_bolt` through `Game.get_service("skills")`.
- Emits `player.health_changed` and `player.died` on the event bus.

## Content
- `ember_bolt` must exist in `game/content/skills/ember_bolt.json` for the skill input to do anything.

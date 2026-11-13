# system.ai

## Components
- `Enemy` (`src/enemy.gd`)

## Behavior
- Added to group `enemies`.
- Chases the first node in group `player`.
- Attacks within `attack_range` every `attack_cooldown` for `attack_damage`.
- Frees itself when its `Health` node emits `died`.
- When `system.sprites` is present, applies `enemy` and plays `idle`/`move`/`attack`;
  otherwise the Polygon2D fallback stays visible.

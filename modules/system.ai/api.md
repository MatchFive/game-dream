# system.ai

## Components
- `Enemy` (`src/enemy.gd`)

## Behavior
- Added to group `enemies`.
- Chases the first node in group `player`.
- Attacks within `attack_range` every `attack_cooldown` for `attack_damage`.
- Frees itself when its `Health` node emits `died`.

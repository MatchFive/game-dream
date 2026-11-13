# system.ai

## Components
- `Enemy` (`src/enemy.gd`)

## Behavior
- Added to group `enemies`.
- Chases the first node in group `player`.
- Attacks within `attack_range` every `attack_cooldown` for `attack_damage`.
- Frees itself when its `Health` node emits `died`.
- `attack_range` from level data controls ranged enemies; a wall blocking line of
  sight keeps the enemy closing instead of attacking through it.
- Boss enemies enter an enrage phase at 50% HP (speed ×1.35, damage ×1.5,
  cooldown ×0.7) and print `GAMEDREAM_BOSS_PHASE` once.
- When `system.sprites` is present, applies `enemy` and plays `idle`/`move`/`attack`;
  otherwise the Polygon2D fallback stays visible.

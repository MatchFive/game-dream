# Using system.loot

- Add `game/content/loot/<enemy_kind>.json` with `{ id, drops: [{ item_id, chance }] }`.
- Ensure the enemy emits `enemy.died` with its kind.
- Loot is added to inventory and announced via `loot.dropped`.

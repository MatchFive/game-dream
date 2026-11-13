# system.loot

## Services
- `Game.get_service("loot")`

## Behavior
- Listens to `enemy.died` with `{ kind: String }`; ignores missing/non-dictionary payloads.
- Reads the loot table with id `kind` from ContentDB (`game/content/loot` or `loot_tables`).
- Rolls each drop, adds it to inventory, emits `loot.dropped` with `{ item_id }`.
- Seeded RNG for repeatable prototype runs.

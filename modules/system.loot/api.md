# system.loot

## Services
- `Game.get_service("loot")`

## Behavior
- Listens to `enemy.died` with `{ kind }`.
- Reads the loot table with id `kind` from ContentDB.
- Rolls each drop, adds it to inventory, emits `loot.dropped`.
- Seeded RNG for repeatable prototype runs.

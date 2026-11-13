# system.levels

## Services
- `Game.get_service("levels")`

## Properties
- `current_index: int`
- `levels: Array`

## Methods
- `current_level() -> Dictionary`
- `current_map() -> Dictionary` — resolves the level's `map` id via `core.content`.
- `level_count() -> int`
- `has_next() -> bool`
- `advance() -> bool` — emits `level.transition` and `level.started`.
- `reset() -> void`
- `serialize() -> Dictionary` / `deserialize(data)` — persists the level index.

## Content
- `game/content/levels/<id>.json` with `{ id, levels: [{ id, name, map, enemy }] }`.
- `map` references `game/content/maps/<id>.json`.
- The first set, preferring `campaign`, is active.

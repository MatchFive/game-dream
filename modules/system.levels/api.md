# system.levels

## Services
- `Game.get_service("levels")`

## Properties
- `current_index: int`
- `levels: Array`

## Methods
- `current_level() -> Dictionary`
- `level_count() -> int`
- `has_next() -> bool`
- `advance() -> bool` — emits `level.transition` and `level.started`.
- `reset() -> void`
- `serialize() -> Dictionary` / `deserialize(data)` — persists the level index.

## Content
- `game/content/levels/<id>.json` with `{ id, levels: [{ id, name, enemy }] }`.
- The first set, preferring `campaign`, is active.

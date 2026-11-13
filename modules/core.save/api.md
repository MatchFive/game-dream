# core.save

## Services
- `Game.get_service("save")`

## Methods
- `save_game() -> bool`
- `load_game() -> bool`
- `has_save() -> bool`
- `clear() -> void` — removes save, backup, and temp files.

## Behavior
- Writes `user://save.json` through a temp file and rename.
- Serializes `inventory`, `progression`, and `equipment` when present.
- Missing services are skipped; a failed load leaves the running state unchanged.

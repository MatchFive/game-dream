# system.dialogue

## Services
- `Game.get_service("dialogue")`

## Methods
- `start(dialogue_id: String) -> bool`
- `advance() -> void`
- `is_active() -> bool`

## Events
- `dialogue.line` with `{ speaker, text, index, total }`
- `dialogue.finished` when the last line is advanced.

## Content
- `game/content/dialogue/<id>.json` with `{ id, lines: [{ speaker, text }] }`.

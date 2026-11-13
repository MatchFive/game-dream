# system.progression

## Services
- `Game.get_service("progression")`

## Properties
- `level: int`
- `xp: int`
- `xp_to_next: int`

## Methods
- `add_xp(amount: int) -> void`
- `serialize() -> Dictionary`
- `deserialize(data: Dictionary) -> void`

## Events
- `enemy.died` grants 10 XP.
- `leveled_up(level)` and `changed(level, xp)` signals.

# system.combat

## Components
- `HealthComponent` (`src/health_component.gd`)

## Methods
- `take_damage(amount: int) -> void`
- `set_max_hp(value: int) -> void`
- `heal_full() -> void`

## Signals
- `health_changed(hp: int, max_hp: int)`
- `died()`

## Config
- `max_hp: int` (exported on the node)

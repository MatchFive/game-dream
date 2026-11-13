# system.equipment

## Services
- `Game.get_service("equipment")`

## Methods
- `equip(item_id: String) -> bool`
- `get_equipped(slot: String) -> String`
- `get_equipped_count() -> int`
- `get_bonus(stat_name: String) -> int`
- `serialize() -> Dictionary`
- `deserialize(data: Dictionary) -> void`

## Item shape
- `id: String`
- `slot: String` (e.g. `weapon`, `armor`, `trinket`)
- `bonuses: { attack_damage?: int, max_hp?: int, ... }`

## Behavior
- Reads item definitions from ContentDB.
- Auto-equips an empty slot when `loot.dropped` fires with `{ item_id }`.
- Emits `changed` after equip/unequip/load.
- Player consumes `attack_damage` and `max_hp` bonuses.

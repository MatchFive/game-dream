# system.equipment

## Services
- `Game.get_service("equipment")`

## Methods
- `equip(item_id: String) -> bool`
- `get_equipped(slot: String) -> String`
- `get_bonus(stat_name: String) -> int`
- `serialize() -> Dictionary`
- `deserialize(data: Dictionary) -> void`

## Behavior
- Reads item definitions from ContentDB.
- Auto-equips an empty slot when `loot.dropped` fires.
- Emits `changed` after equip/unequip/load.

# system.inventory

## Services
- `Game.get_service("inventory")`

## Methods
- `add_item(item_id: String, count: int = 1) -> bool`
- `remove_item(item_id: String, count: int = 1) -> bool`
- `count(item_id: String) -> int`
- `total_count() -> int`
- `serialize() -> Dictionary`
- `deserialize(data: Dictionary) -> void`

## Signals
- `item_added(item_id: String, count: int)`
- `item_removed(item_id: String, count: int)`
- `changed()`

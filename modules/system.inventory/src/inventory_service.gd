extends Node

signal item_added(item_id: String, count: int)
signal item_removed(item_id: String, count: int)
signal changed()

var _items: Dictionary = {}

func _ready() -> void:
	Game.register_service("inventory", self)

func add_item(item_id: String, count: int = 1) -> bool:
	if count <= 0:
		return false
	_items[item_id] = int(_items.get(item_id, 0)) + count
	item_added.emit(item_id, count)
	changed.emit()
	return true

func remove_item(item_id: String, count: int = 1) -> bool:
	var current := int(_items.get(item_id, 0))
	if count <= 0 or current < count:
		return false
	_items[item_id] = current - count
	if int(_items[item_id]) == 0:
		_items.erase(item_id)
	item_removed.emit(item_id, count)
	changed.emit()
	return true

func count(item_id: String) -> int:
	return int(_items.get(item_id, 0))

func total_count() -> int:
	var total := 0
	for value in _items.values():
		total += int(value)
	return total

func serialize() -> Dictionary:
	return {"items": _items.duplicate(true)}

func deserialize(data: Dictionary) -> void:
	_items = data.get("items", {}).duplicate(true)
	changed.emit()

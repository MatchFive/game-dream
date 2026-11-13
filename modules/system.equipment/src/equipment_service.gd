extends Node

signal changed()

var _equipped: Dictionary = {}

func _ready() -> void:
	Game.register_service("equipment", self)
	Game.events.event_emitted.connect(_on_event)

func _on_event(event_name: String, payload: Variant) -> void:
	if event_name == "loot.dropped":
		_auto_equip(str(payload["item_id"]))

func equip(item_id: String) -> bool:
	var content = Game.get_service("content")
	if content == null:
		return false
	var item: Dictionary = content.get_item(item_id)
	if item.is_empty():
		return false
	var slot := str(item.get("slot", ""))
	if slot == "":
		return false
	_equipped[slot] = item_id
	changed.emit()
	return true

func get_equipped(slot: String) -> String:
	return str(_equipped.get(slot, ""))

func get_bonus(stat_name: String) -> int:
	var content = Game.get_service("content")
	if content == null:
		return 0
	var total := 0
	for item_id in _equipped.values():
		var item: Dictionary = content.get_item(str(item_id))
		var bonuses: Dictionary = item.get("bonuses", {})
		total += int(bonuses.get(stat_name, 0))
	return total

func _auto_equip(item_id: String) -> void:
	var content = Game.get_service("content")
	if content == null:
		return
	var item: Dictionary = content.get_item(item_id)
	var slot := str(item.get("slot", ""))
	if slot != "" and not _equipped.has(slot):
		equip(item_id)

func serialize() -> Dictionary:
	return {"equipped": _equipped.duplicate(true)}

func deserialize(data: Dictionary) -> void:
	_equipped = data.get("equipped", {}).duplicate(true)
	changed.emit()

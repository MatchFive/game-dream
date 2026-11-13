extends Node

signal changed()

var campaign_id: String = ""
var levels: Array = []
var current_index: int = 0

func _ready() -> void:
	Game.register_service("levels", self)
	var content = Game.get_service("content")
	if content == null:
		return
	if content.levels.has("campaign"):
		campaign_id = "campaign"
	elif not content.levels.is_empty():
		campaign_id = str(content.levels.keys()[0])
	if campaign_id == "":
		return
	var data: Dictionary = content.get_level(campaign_id)
	var raw_levels = data.get("levels", [])
	levels = raw_levels if raw_levels is Array else []

func current_level() -> Dictionary:
	if current_index < 0 or current_index >= levels.size():
		return {}
	var value = levels[current_index]
	return value if value is Dictionary else {}

func level_count() -> int:
	return levels.size()

func has_next() -> bool:
	return current_index + 1 < levels.size()

func advance() -> bool:
	if not has_next():
		return false
	var from_index := current_index
	current_index += 1
	Game.events.emit_event("level.transition", {
		"from": from_index,
		"to": current_index,
	})
	Game.events.emit_event("level.started", {
		"index": current_index,
		"level": current_level(),
	})
	changed.emit()
	return true

func reset() -> void:
	current_index = 0
	changed.emit()

func serialize() -> Dictionary:
	return {"campaign": campaign_id, "index": current_index}

func deserialize(data: Dictionary) -> void:
	var index := int(data.get("index", 0))
	current_index = clampi(index, 0, max(0, levels.size() - 1))
	if not levels.is_empty():
		Game.events.emit_event("level.started", {
			"index": current_index,
			"level": current_level(),
		})
	changed.emit()

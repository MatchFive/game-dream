extends Node

var _rng := RandomNumberGenerator.new()

func _ready() -> void:
	_rng.seed = 42
	Game.register_service("loot", self)
	Game.events.event_emitted.connect(_on_event)

func _on_event(event_name: String, payload: Variant) -> void:
	if event_name != "enemy.died" or not payload is Dictionary:
		return
	var kind := str(payload.get("kind", ""))
	var content = Game.get_service("content")
	if content == null:
		return
	var table: Dictionary = content.get_loot_table(kind)
	var inventory = Game.get_service("inventory")
	if inventory == null:
		return
	for drop in table.get("drops", []):
		if _rng.randf() <= float(drop.get("chance", 0.0)):
			var item_id := str(drop.get("item_id", ""))
			if item_id == "":
				continue
			inventory.add_item(item_id, 1)
			Game.events.emit_event("loot.dropped", {"item_id": item_id})

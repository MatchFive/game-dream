extends Node

signal changed(level: int, xp: int)
signal leveled_up(level: int)

var level: int = 1
var xp: int = 0
var xp_to_next: int = 10

func _ready() -> void:
	Game.register_service("progression", self)
	Game.events.event_emitted.connect(_on_event)

func _on_event(event_name: String, _payload: Variant) -> void:
	if event_name == "enemy.died":
		add_xp(10)

func add_xp(amount: int) -> void:
	xp += max(0, amount)
	while xp >= xp_to_next:
		xp -= xp_to_next
		level += 1
		xp_to_next = 10 + level * 5
		leveled_up.emit(level)
	changed.emit(level, xp)
	if Game.events:
		Game.events.emit_event("progression.changed", {
			"level": level,
			"xp": xp,
			"xp_to_next": xp_to_next,
		})

func serialize() -> Dictionary:
	return {"level": level, "xp": xp, "xp_to_next": xp_to_next}

func deserialize(data: Dictionary) -> void:
	level = int(data.get("level", 1))
	xp = int(data.get("xp", 0))
	xp_to_next = int(data.get("xp_to_next", 10))
	changed.emit(level, xp)

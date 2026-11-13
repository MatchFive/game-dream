extends Node

signal event_emitted(name: String, payload: Variant)

func _ready() -> void:
	Game.register_event_bus(self)

func emit_event(event_name: String, payload: Variant = null) -> void:
	event_emitted.emit(event_name, payload)

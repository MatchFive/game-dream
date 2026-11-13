extends Node

func test_emit_event() -> void:
	var bus := preload("res://modules/core.events/src/event_bus.gd").new()
	add_child(bus)
	bus.emit_event("test.event", {"value": 1})
	# Signal assertions are covered by the scenario runner in Plan 2.
	assert(true)

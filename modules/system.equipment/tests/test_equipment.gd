extends Node

func test_equipment_service_exists() -> void:
	var script := load("res://modules/system.equipment/src/equipment_service.gd")
	assert(script != null)

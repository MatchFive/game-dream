extends Node

func test_loot_service_exists() -> void:
	var script := load("res://modules/system.loot/src/loot_service.gd")
	assert(script != null)

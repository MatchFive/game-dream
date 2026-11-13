extends Node

func test_level_up() -> void:
	var progression := preload("res://modules/system.progression/src/progression_service.gd").new()
	add_child(progression)
	progression.add_xp(10)
	assert(progression.level == 2)

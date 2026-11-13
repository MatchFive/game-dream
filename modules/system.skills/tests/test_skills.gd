extends Node

func test_skill_service_exists() -> void:
	var script := load("res://modules/system.skills/src/skill_service.gd")
	assert(script != null)

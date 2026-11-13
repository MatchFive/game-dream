extends Node

func test_gameflow_scene_loads() -> void:
	var scene := load("res://modules/system.gameflow/scenes/game.tscn")
	assert(scene != null)

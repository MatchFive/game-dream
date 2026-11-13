extends Node

func test_enemy_scene_loads() -> void:
	var scene := load("res://modules/system.ai/scenes/enemy.tscn")
	assert(scene != null)

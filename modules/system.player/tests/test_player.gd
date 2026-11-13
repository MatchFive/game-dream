extends Node

func test_player_scene_loads() -> void:
	var scene := load("res://modules/system.player/scenes/player.tscn")
	assert(scene != null)

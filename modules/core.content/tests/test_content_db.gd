extends Node

func test_content_db_exists() -> void:
	var script := load("res://modules/core.content/src/content_db.gd")
	assert(script != null)

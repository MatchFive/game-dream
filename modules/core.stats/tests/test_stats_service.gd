extends Node

func test_set_and_get_stat() -> void:
	var stats := preload("res://modules/core.stats/src/stats_service.gd").new()
	add_child(stats)
	stats.set_stat("hp", 10.0)
	assert(is_equal_approx(stats.get_stat("hp"), 10.0))

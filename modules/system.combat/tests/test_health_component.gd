extends Node

func test_take_damage() -> void:
	var health := preload("res://modules/system.combat/src/health_component.gd").new()
	health.max_hp = 10
	add_child(health)
	health.take_damage(4)
	assert(health.hp == 6)

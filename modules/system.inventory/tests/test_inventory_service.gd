extends Node

func test_add_item() -> void:
	var inventory := preload("res://modules/system.inventory/src/inventory_service.gd").new()
	add_child(inventory)
	assert(inventory.add_item("potion", 1))
	assert(inventory.count("potion") == 1)
	assert(inventory.total_count() == 1)

extends Node

signal health_changed(hp: int, max_hp: int)
signal died()

@export var max_hp: int = 100

var hp: int

func _ready() -> void:
	hp = max_hp
	health_changed.emit(hp, max_hp)

func take_damage(amount: int) -> void:
	if amount <= 0 or hp <= 0:
		return
	hp = max(0, hp - amount)
	health_changed.emit(hp, max_hp)
	if hp == 0:
		died.emit()

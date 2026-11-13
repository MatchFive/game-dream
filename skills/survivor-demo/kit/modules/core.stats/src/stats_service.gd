extends Node

signal stat_changed(stat_name: String, value: float)

var _stats: Dictionary = {}

func _ready() -> void:
	Game.register_service("stats", self)

func set_stat(stat_name: String, value: float) -> void:
	_stats[stat_name] = value
	stat_changed.emit(stat_name, value)

func get_stat(stat_name: String, default_value: float = 0.0) -> float:
	return float(_stats.get(stat_name, default_value))

extends Node

var _cooldowns: Dictionary = {}
var cast_count: int = 0

func _ready() -> void:
	Game.register_service("skills", self)

func _process(delta: float) -> void:
	for skill_id in _cooldowns.keys():
		_cooldowns[skill_id] = max(0.0, float(_cooldowns[skill_id]) - delta)

func reset() -> void:
	_cooldowns.clear()
	cast_count = 0

func cast(skill_id: String, caster: Node) -> bool:
	if float(_cooldowns.get(skill_id, 0.0)) > 0.0:
		return false
	var content = Game.get_service("content")
	if content == null:
		return false
	var skill: Dictionary = content.get_skill(skill_id)
	if skill.is_empty():
		return false
	_cooldowns[skill_id] = float(skill.get("cooldown", 1.0))
	cast_count += 1
	var damage := int(skill.get("damage", 10))
	var attack_range := float(skill.get("range", 200.0))
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if caster.global_position.distance_to(enemy.global_position) <= attack_range:
			var enemy_health = enemy.get_node_or_null("Health")
			if enemy_health:
				enemy_health.take_damage(damage)
	Game.events.emit_event("skill.cast", {"skill": skill_id})
	return true

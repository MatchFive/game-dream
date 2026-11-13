extends CharacterBody2D

@export var speed: float = 80.0
@export var attack_range: float = 40.0
@export var attack_damage: int = 5
@export var attack_cooldown: float = 1.0
@export var enemy_kind: String = "slime"

@onready var health = $Health

var _cooldown := 0.0

func _ready() -> void:
	add_to_group("enemies")
	health.died.connect(_on_died)

func _physics_process(delta: float) -> void:
	_cooldown = max(0.0, _cooldown - delta)
	var players = get_tree().get_nodes_in_group("player")
	if players.is_empty():
		return
	var player = players[0]
	var distance = global_position.distance_to(player.global_position)
	if distance > attack_range:
		var direction = (player.global_position - global_position).normalized()
		velocity = direction * speed
		move_and_slide()
	else:
		velocity = Vector2.ZERO
		if _cooldown <= 0.0:
			_cooldown = attack_cooldown
			var player_health = player.get_node_or_null("Health")
			if player_health:
				player_health.take_damage(attack_damage)

func _on_died() -> void:
	if Game.events:
		Game.events.emit_event("enemy.died", {"kind": enemy_kind})
	queue_free()

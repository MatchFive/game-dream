extends CharacterBody2D

@export var speed: float = 200.0
@export var attack_damage: int = 10
@export var attack_range: float = 64.0

@onready var health = $Health

var _attack_cooldown := 0.0

func _ready() -> void:
	add_to_group("player")
	health.health_changed.connect(_on_health_changed)
	health.died.connect(_on_died)
	_on_health_changed(health.hp, health.max_hp)

func _physics_process(_delta: float) -> void:
	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	velocity = direction * speed
	move_and_slide()

func _process(delta: float) -> void:
	_attack_cooldown = max(0.0, _attack_cooldown - delta)
	if Input.is_action_pressed("attack") and _attack_cooldown <= 0.0:
		_attack_cooldown = 0.25
		_attack()

func _attack() -> void:
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if global_position.distance_to(enemy.global_position) <= attack_range:
			var enemy_health = enemy.get_node_or_null("Health")
			if enemy_health:
				enemy_health.take_damage(attack_damage)

func _on_health_changed(hp: int, max_hp: int) -> void:
	if Game.events:
		Game.events.emit_event("player.health_changed", {"hp": hp, "max_hp": max_hp})

func _on_died() -> void:
	if Game.events:
		Game.events.emit_event("player.died", {})

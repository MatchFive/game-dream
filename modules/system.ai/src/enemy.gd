extends CharacterBody2D

@export var speed: float = 80.0
@export var attack_range: float = 40.0
@export var attack_damage: int = 5
@export var attack_cooldown: float = 1.0
@export var enemy_kind: String = "slime"

@onready var health = $Health
@onready var fallback_sprite: Polygon2D = $Sprite
@onready var animated_sprite: AnimatedSprite2D = $AnimatedSprite2D

var _cooldown := 0.0

func _ready() -> void:
	add_to_group("enemies")
	health.died.connect(_on_died)
	_setup_sprite()

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
			_play_attack()
			var player_health = player.get_node_or_null("Health")
			if player_health:
				player_health.take_damage(attack_damage)
	_update_animation(velocity.length() > 0.1)

func _setup_sprite() -> void:
	var sprites = Game.get_service("sprites")
	if sprites and sprites.apply(animated_sprite, "enemy"):
		fallback_sprite.visible = false
		animated_sprite.animation_finished.connect(_on_animation_finished)
	else:
		animated_sprite.visible = false

func _play_attack() -> void:
	if not animated_sprite.visible:
		return
	if animated_sprite.sprite_frames.has_animation("attack") and animated_sprite.animation != "attack":
		animated_sprite.play("attack")

func _update_animation(moving: bool) -> void:
	if not animated_sprite.visible:
		return
	if animated_sprite.animation == "attack" and animated_sprite.is_playing():
		return
	var target := "move" if moving else "idle"
	if not animated_sprite.sprite_frames.has_animation(target):
		target = "idle"
	if animated_sprite.animation != target:
		animated_sprite.play(target)

func _on_animation_finished() -> void:
	if animated_sprite.animation == "attack":
		var target := "move" if velocity.length() > 0.1 else "idle"
		if animated_sprite.sprite_frames.has_animation(target):
			animated_sprite.play(target)

func _on_died() -> void:
	if Game.events:
		Game.events.emit_event("enemy.died", {"kind": enemy_kind})
	queue_free()

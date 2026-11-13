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
var _boss_phase := false

func _ready() -> void:
	add_to_group("enemies")
	health.died.connect(_on_died)
	_setup_sprite()

func _physics_process(delta: float) -> void:
	_update_boss_phase()
	_cooldown = max(0.0, _cooldown - delta)
	var players = get_tree().get_nodes_in_group("player")
	if players.is_empty():
		return
	var player = players[0]
	var distance = global_position.distance_to(player.global_position)
	var line_of_sight := _has_line_of_sight(player)
	if distance > attack_range or not line_of_sight:
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

func _has_line_of_sight(player: CollisionObject2D) -> bool:
	var query := PhysicsRayQueryParameters2D.create(
		global_position,
		player.global_position,
	)
	query.exclude = [get_rid(), player.get_rid()]
	return get_world_2d().direct_space_state.intersect_ray(query).is_empty()

func _update_boss_phase() -> void:
	if _boss_phase or enemy_kind != "boss":
		return
	if health.hp <= health.max_hp * 0.5:
		_boss_phase = true
		speed *= 1.35
		attack_damage = int(ceil(float(attack_damage) * 1.5))
		attack_cooldown *= 0.7
		if animated_sprite.visible:
			animated_sprite.modulate = Color(1.0, 0.55, 0.55)
		fallback_sprite.color = Color(1.0, 0.35, 0.3, 1.0)
		print("GAMEDREAM_BOSS_PHASE")

func _setup_sprite() -> void:
	var sprites = Game.get_service("sprites")
	if sprites == null:
		animated_sprite.visible = false
		return
	var sprite_id := "enemy"
	var content = Game.get_service("content")
	if content and not enemy_kind.is_empty() and not content.get_sprite(enemy_kind).is_empty():
		sprite_id = enemy_kind
	if sprites.apply(animated_sprite, sprite_id):
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
	var target := _pick_animation("move" if moving else "idle")
	if target != "" and animated_sprite.animation != target:
		animated_sprite.play(target)

func _pick_animation(preferred: String) -> String:
	if animated_sprite.sprite_frames == null:
		return ""
	var frames := animated_sprite.sprite_frames
	if frames.has_animation(preferred) and frames.get_frame_count(preferred) > 0:
		return preferred
	for name in frames.get_animation_names():
		var candidate := str(name)
		if candidate != "default" and frames.get_frame_count(candidate) > 0:
			return candidate
	return ""

func _on_animation_finished() -> void:
	if animated_sprite.animation == "attack":
		var target := _pick_animation("move" if velocity.length() > 0.1 else "idle")
		if target != "":
			animated_sprite.play(target)

func _on_died() -> void:
	if Game.events:
		Game.events.emit_event("enemy.died", {"kind": enemy_kind})
	queue_free()

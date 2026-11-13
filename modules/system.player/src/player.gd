extends CharacterBody2D

@export var speed: float = 200.0
@export var attack_damage: int = 10
@export var attack_range: float = 64.0

@onready var health = $Health
@onready var fallback_sprite: Polygon2D = $Sprite
@onready var animated_sprite: AnimatedSprite2D = $AnimatedSprite2D

var _attack_cooldown := 0.0
var _base_attack_damage: int = 0
var _base_max_hp: int = 0

func _ready() -> void:
	add_to_group("player")
	_setup_sprite()
	_base_attack_damage = attack_damage
	_base_max_hp = health.max_hp
	health.health_changed.connect(_on_health_changed)
	health.died.connect(_on_died)
	Game.service_registered.connect(_on_service_registered)
	if Game.has_service("equipment"):
		_bind_equipment(Game.get_service("equipment"))
	_on_health_changed(health.hp, health.max_hp)

func _physics_process(_delta: float) -> void:
	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	velocity = direction * speed
	move_and_slide()
	_update_animation(direction.length() > 0.1)

func _process(delta: float) -> void:
	_attack_cooldown = max(0.0, _attack_cooldown - delta)
	if Input.is_action_pressed("attack") and _attack_cooldown <= 0.0:
		_attack_cooldown = 0.25
		_attack()
	if Input.is_action_pressed("skill_1"):
		var skills = Game.get_service("skills")
		if skills:
			skills.cast("ember_bolt", self)

func _on_service_registered(service_name: String, service: Node) -> void:
	if service_name == "equipment":
		_bind_equipment(service)

func _bind_equipment(equipment: Node) -> void:
	equipment.changed.connect(_apply_equipment)
	_apply_equipment()

func _apply_equipment() -> void:
	var equipment = Game.get_service("equipment")
	if equipment == null:
		return
	attack_damage = _base_attack_damage + equipment.get_bonus("attack_damage")
	health.set_max_hp(_base_max_hp + equipment.get_bonus("max_hp"))

func _attack() -> void:
	_play_attack()
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if global_position.distance_to(enemy.global_position) <= attack_range:
			var enemy_health = enemy.get_node_or_null("Health")
			if enemy_health:
				enemy_health.take_damage(attack_damage)

func _setup_sprite() -> void:
	var sprites = Game.get_service("sprites")
	if sprites and sprites.apply(animated_sprite, "player"):
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

func _on_health_changed(hp: int, max_hp: int) -> void:
	if Game.events:
		Game.events.emit_event("player.health_changed", {"hp": hp, "max_hp": max_hp})

func _on_died() -> void:
	if Game.events:
		Game.events.emit_event("player.died", {})

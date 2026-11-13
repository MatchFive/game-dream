extends Node2D

const ENEMY_SCENE := preload("res://modules/system.ai/scenes/enemy.tscn")

@onready var player: CharacterBody2D = $Player
@onready var enemy_root: Node2D = $EnemyRoot

var enemy = null
var _finished := false

func _ready() -> void:
	player.get_node("Health").died.connect(_lose)
	_apply_level()
	Game.events.event_emitted.connect(_on_event)
	if DisplayServer.get_name() == "headless":
		_headless_start()

func _on_event(event_name: String, _payload: Variant) -> void:
	if event_name == "game.started":
		var dialogue = Game.get_service("dialogue")
		if dialogue and not dialogue.is_active():
			dialogue.start("intro")
	elif event_name == "level.started" and not _finished:
		var levels = Game.get_service("levels")
		if levels and levels.current_index == 1:
			print("GAMEDREAM_LEVEL_2")
		_apply_level()

func _apply_level() -> void:
	if is_instance_valid(enemy):
		enemy.queue_free()
	enemy = null
	var level := {}
	var levels = Game.get_service("levels")
	if levels:
		level = levels.current_level()
	var data_value = level.get("enemy", {})
	var data: Dictionary = data_value if data_value is Dictionary else {}
	enemy = ENEMY_SCENE.instantiate()
	enemy.enemy_kind = str(data.get("kind", "slime"))
	enemy.speed = float(data.get("speed", 80.0))
	enemy.attack_damage = int(data.get("attack_damage", 5))
	enemy.position = Vector2(float(data.get("x", 600)), float(data.get("y", 240)))
	enemy.get_node("Health").max_hp = int(data.get("max_hp", 30))
	enemy_root.add_child(enemy)
	enemy.get_node("Health").died.connect(_on_enemy_died)
	var health = player.get_node("Health")
	health.heal_full()

func _headless_start() -> void:
	var dialogue = Game.get_service("dialogue")
	if dialogue and dialogue.start("intro"):
		while dialogue.is_active():
			await get_tree().create_timer(0.05).timeout
			dialogue.advance()
		print("GAMEDREAM_DIALOGUE")
	_autoplay()

func _on_enemy_died() -> void:
	if _finished:
		return
	var levels = Game.get_service("levels")
	if levels and levels.has_next():
		levels.advance()
	else:
		_win()

func _win() -> void:
	if _finished:
		return
	_finished = true
	await get_tree().process_frame
	var equipment = Game.get_service("equipment")
	if equipment:
		if player.attack_damage < 15:
			push_error("GAMEDREAM_EQUIP_BONUS_MISSING")
			get_tree().quit(1)
			return
		if player.get_node("Health").max_hp < 120:
			push_error("GAMEDREAM_HP_BONUS_MISSING")
			get_tree().quit(1)
			return
	var save = Game.get_service("save")
	if save:
		if not save.save_game() or not save.save_game() or not save.load_game():
			push_error("GAMEDREAM_SAVE_MISSING")
			get_tree().quit(1)
			return
	var progression = Game.get_service("progression")
	if progression and progression.level > 1:
		print("GAMEDREAM_LEVEL_UP")
	if equipment and equipment.get_equipped_count() > 0:
		print("GAMEDREAM_EQUIPPED")
	var skills = Game.get_service("skills")
	if skills and skills.cast_count > 0:
		print("GAMEDREAM_SKILL_CAST")
	var quests = Game.get_service("quests")
	if quests and quests.completed_count > 0:
		print("GAMEDREAM_QUEST_COMPLETE")
	print("GAMEDREAM_WIN")
	get_tree().quit(0)

func _lose() -> void:
	if _finished:
		return
	_finished = true
	print("GAMEDREAM_LOSE")
	get_tree().quit(0)

func _autoplay() -> void:
	await get_tree().create_timer(0.2).timeout
	Input.action_press("move_right")
	await get_tree().create_timer(1.0).timeout
	Input.action_release("move_right")
	var skills = Game.get_service("skills")
	if skills:
		Input.action_press("skill_1")
		await get_tree().create_timer(0.1).timeout
		Input.action_release("skill_1")
		await get_tree().create_timer(0.2).timeout
		if is_instance_valid(enemy) and enemy.get_node("Health").hp > 10:
			push_error("GAMEDREAM_SKILL_DAMAGE_MISSING")
			get_tree().quit(1)
			return
	var frames := 0
	while not _finished and frames < 1200:
		if is_instance_valid(enemy) and player.global_position.distance_to(enemy.global_position) > 50.0:
			Input.action_press("move_right")
			Input.action_release("attack")
		else:
			Input.action_release("move_right")
			Input.action_press("attack")
		await get_tree().physics_frame
		frames += 1
	Input.action_release("attack")
	Input.action_release("move_right")
	if not _finished:
		_lose()

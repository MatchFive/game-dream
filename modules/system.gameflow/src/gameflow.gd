extends Node2D

const ENEMY_SCENE := preload("res://modules/system.ai/scenes/enemy.tscn")

@onready var player: CharacterBody2D = $Player
@onready var enemy_root: Node2D = $EnemyRoot
@onready var map_root: Node2D = $MapRoot

var enemy = null
var _finished := false
var _level2_reported := false
var _boss_reported := false
var _map_reported := false
var _sprite_reported := false
var _audio_reported := false

func _ready() -> void:
	player.get_node("Health").died.connect(_lose)
	_apply_level()
	call_deferred("_report_sprites")
	call_deferred("_report_audio")
	Game.events.event_emitted.connect(_on_event)
	if DisplayServer.get_name() == "headless":
		_headless_start()

func _on_event(event_name: String, payload: Variant) -> void:
	if event_name == "game.started":
		if payload is Dictionary and bool(payload.get("new_game", false)):
			_reset_run()
		var dialogue = Game.get_service("dialogue")
		if dialogue and not dialogue.is_active():
			dialogue.start("intro")
	elif event_name == "game.restart":
		_reset_run()
		var dialogue = Game.get_service("dialogue")
		if dialogue:
			dialogue.start("intro")
	elif event_name == "level.started" and not _finished:
		var levels = Game.get_service("levels")
		if levels and levels.current_index == 1 and not _level2_reported:
			_level2_reported = true
			print("GAMEDREAM_LEVEL_2")
		if levels and levels.current_index == 2 and not _boss_reported:
			_boss_reported = true
			print("GAMEDREAM_BOSS")
		_apply_level()

func _reset_run() -> void:
	get_tree().paused = false
	var inventory = Game.get_service("inventory")
	if inventory and inventory.has_method("reset"):
		inventory.reset()
	var progression = Game.get_service("progression")
	if progression and progression.has_method("reset"):
		progression.reset()
	var equipment = Game.get_service("equipment")
	if equipment and equipment.has_method("reset"):
		equipment.reset()
	var quests = Game.get_service("quests")
	if quests and quests.has_method("reset"):
		quests.reset()
	var skills = Game.get_service("skills")
	if skills and skills.has_method("reset"):
		skills.reset()
	var loot = Game.get_service("loot")
	if loot and loot.has_method("reset"):
		loot.reset()
	var save = Game.get_service("save")
	if save and save.has_method("clear"):
		save.clear()
	var levels = Game.get_service("levels")
	if levels:
		levels.reset()
	_finished = false
	_level2_reported = false
	_boss_reported = false
	_map_reported = false
	player.global_position = Vector2(320, 240)
	var health = player.get_node("Health")
	health.hp = health.max_hp
	health.health_changed.emit(health.hp, health.max_hp)
	_apply_level()
	Game.events.emit_event("run.reset", {})
	call_deferred("_report_sprites")

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
	if not level.is_empty() and data.is_empty():
		push_warning("level: missing enemy data; using defaults")
	for child in map_root.get_children():
		map_root.remove_child(child)
		child.queue_free()
	var map_data := {}
	var maps = Game.get_service("maps")
	var map_built := false
	if maps:
		if levels:
			map_data = levels.current_map()
		map_built = maps.build(map_root, map_data)
		if map_built and not _map_reported:
			_map_reported = true
			print("GAMEDREAM_MAP_OK")
	enemy = ENEMY_SCENE.instantiate()
	enemy.enemy_kind = str(data.get("kind", "slime"))
	enemy.speed = maxf(0.0, float(data.get("speed", 80.0)))
	enemy.attack_damage = maxi(0, int(data.get("attack_damage", 5)))
	enemy.position = Vector2(float(data.get("x", 600)), float(data.get("y", 240)))
	enemy.scale = Vector2.ONE * float(data.get("scale", 1.0))
	if map_built and maps.is_wall(map_data, enemy.position):
		push_warning("level: enemy spawn inside wall; snapping to floor")
		enemy.position = maps.first_floor(map_data)
	enemy.get_node("Health").max_hp = maxi(1, int(data.get("max_hp", 30)))
	enemy_root.add_child(enemy)
	enemy.get_node("Health").died.connect(_on_enemy_died)
	var health = player.get_node("Health")
	health.heal_full()
	if map_built and maps.is_wall(map_data, player.global_position):
		push_warning("level: player inside wall; snapping to floor")
		player.global_position = maps.first_floor(map_data)

func _report_sprites() -> void:
	if _sprite_reported:
		return
	var sprites = Game.get_service("sprites")
	if sprites and sprites.has_applied("player") and sprites.has_applied("enemy"):
		_sprite_reported = true
		print("GAMEDREAM_SPRITE_OK")

func _report_audio() -> void:
	if _audio_reported:
		return
	var audio = Game.get_service("audio")
	if audio and audio.initialized:
		_audio_reported = true
		print("GAMEDREAM_AUDIO_OK")

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
	if DisplayServer.get_name() == "headless":
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
	print("GAMEDREAM_VICTORY")
	if DisplayServer.get_name() == "headless":
		print("GAMEDREAM_WIN")
		get_tree().quit(0)
		return
	var levels = Game.get_service("levels")
	var health = player.get_node("Health")
	if get_tree().get_first_node_in_group("result_screen"):
		get_tree().paused = true
		Game.events.emit_event("game.won", {
			"level": levels.current_index + 1 if levels else 1,
			"hp": health.hp,
			"max_hp": health.max_hp,
		})
	else:
		get_tree().quit(0)

func _lose() -> void:
	if _finished:
		return
	_finished = true
	print("GAMEDREAM_LOSE")
	if DisplayServer.get_name() == "headless":
		get_tree().quit(0)
		return
	var levels = Game.get_service("levels")
	var health = player.get_node("Health")
	if get_tree().get_first_node_in_group("result_screen"):
		get_tree().paused = true
		Game.events.emit_event("game.lost", {
			"level": levels.current_index + 1 if levels else 1,
			"hp": health.hp,
			"max_hp": health.max_hp,
		})
	else:
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
	while not _finished and frames < 900:
		if is_instance_valid(enemy):
			var offset: Vector2 = enemy.global_position - player.global_position
			if offset.length() <= 50.0:
				_stop_move()
				Input.action_press("attack")
			else:
				Input.action_release("attack")
				_steer(offset)
		else:
			Input.action_release("attack")
		await get_tree().physics_frame
		frames += 1
	Input.action_release("attack")
	_stop_move()
	if not _finished:
		_lose()

func _steer(offset: Vector2) -> void:
	_steer_axis(offset.x, "move_right", "move_left")
	_steer_axis(offset.y, "move_down", "move_up")

func _steer_axis(value: float, positive: String, negative: String) -> void:
	if value > 5.0:
		Input.action_press(positive)
		Input.action_release(negative)
	elif value < -5.0:
		Input.action_press(negative)
		Input.action_release(positive)
	else:
		Input.action_release(positive)
		Input.action_release(negative)

func _stop_move() -> void:
	for action in ["move_left", "move_right", "move_up", "move_down"]:
		Input.action_release(action)

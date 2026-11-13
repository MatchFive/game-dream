extends Node2D

@onready var player: CharacterBody2D = $Player
@onready var enemy: CharacterBody2D = $Enemy

var _finished := false

func _ready() -> void:
	player.get_node("Health").died.connect(_lose)
	enemy.get_node("Health").died.connect(_win)
	if DisplayServer.get_name() == "headless":
		_headless_start()
	else:
		var dialogue = Game.get_service("dialogue")
		if dialogue:
			dialogue.start("intro")

func _headless_start() -> void:
	var dialogue = Game.get_service("dialogue")
	if dialogue and dialogue.start("intro"):
		while dialogue.is_active():
			await get_tree().create_timer(0.05).timeout
			dialogue.advance()
		print("GAMEDREAM_DIALOGUE")
	_autoplay()

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
	await get_tree().create_timer(1.4).timeout
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
	for _i in 3:
		Input.action_press("attack")
		await get_tree().create_timer(0.1).timeout
		Input.action_release("attack")
		await get_tree().create_timer(0.3).timeout
	await get_tree().create_timer(0.5).timeout
	if not _finished:
		_lose()

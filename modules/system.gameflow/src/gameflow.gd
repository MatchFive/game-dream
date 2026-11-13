extends Node2D

@onready var player: CharacterBody2D = $Player
@onready var enemy: CharacterBody2D = $Enemy

var _finished := false
var _skill_used := false

func _ready() -> void:
	player.get_node("Health").died.connect(_lose)
	enemy.get_node("Health").died.connect(_win)
	Game.events.event_emitted.connect(_on_event)
	if DisplayServer.get_name() == "headless":
		_autoplay()

func _on_event(event_name: String, _payload: Variant) -> void:
	if event_name == "skill.cast":
		_skill_used = true

func _win() -> void:
	if _finished:
		return
	_finished = true
	await get_tree().process_frame
	var progression = Game.get_service("progression")
	if progression and progression.level > 1:
		print("GAMEDREAM_LEVEL_UP")
	var equipment = Game.get_service("equipment")
	if equipment and equipment.get_equipped("weapon") != "":
		print("GAMEDREAM_EQUIPPED")
	if _skill_used:
		print("GAMEDREAM_SKILL_CAST")
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
	Input.action_press("skill_1")
	await get_tree().create_timer(0.1).timeout
	Input.action_release("skill_1")
	await get_tree().create_timer(0.2).timeout
	for _i in 3:
		Input.action_press("attack")
		await get_tree().create_timer(0.1).timeout
		Input.action_release("attack")
		await get_tree().create_timer(0.3).timeout
	await get_tree().create_timer(0.5).timeout
	if not _finished:
		_lose()

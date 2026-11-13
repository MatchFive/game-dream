extends Node2D

@onready var player: CharacterBody2D = $Player
@onready var enemy: CharacterBody2D = $Enemy

var _finished := false

func _ready() -> void:
	player.get_node("Health").died.connect(_lose)
	enemy.get_node("Health").died.connect(_win)
	if DisplayServer.get_name() == "headless":
		_autoplay()

func _win() -> void:
	if _finished:
		return
	_finished = true
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
	for _i in 3:
		Input.action_press("attack")
		await get_tree().create_timer(0.1).timeout
		Input.action_release("attack")
		await get_tree().create_timer(0.3).timeout
	await get_tree().create_timer(0.5).timeout
	if not _finished:
		_lose()

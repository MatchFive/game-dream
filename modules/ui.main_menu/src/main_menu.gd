extends CanvasLayer

@onready var new_game_button: Button = $Panel/VBox/NewGame
@onready var continue_button: Button = $Panel/VBox/Continue
@onready var settings_button: Button = $Panel/VBox/Settings
@onready var quit_button: Button = $Panel/VBox/Quit

func _ready() -> void:
	add_to_group("main_menu")
	new_game_button.pressed.connect(_start)
	continue_button.pressed.connect(_continue)
	settings_button.pressed.connect(_settings)
	quit_button.pressed.connect(_quit)
	if DisplayServer.get_name() == "headless":
		visible = false
	else:
		get_tree().paused = true
	var save = Game.get_service("save")
	continue_button.disabled = not (save and save.has_save())

func _close_pause() -> void:
	var pause = get_tree().get_first_node_in_group("pause_menu")
	if pause:
		pause.visible = false

func _start() -> void:
	_close_pause()
	visible = false
	get_tree().paused = false
	Game.events.emit_event("game.started", {"new_game": true})

func _continue() -> void:
	var save = Game.get_service("save")
	if save and save.load_game():
		_close_pause()
		visible = false
		get_tree().paused = false
		Game.events.emit_event("game.started", {"new_game": false})
	else:
		continue_button.text = "No save"

func _settings() -> void:
	Game.events.emit_event("settings.open", {})

func _quit() -> void:
	get_tree().quit()

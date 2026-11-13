extends CanvasLayer

@onready var new_game_button: Button = $Panel/VBox/NewGame
@onready var continue_button: Button = $Panel/VBox/Continue
@onready var quit_button: Button = $Panel/VBox/Quit

func _ready() -> void:
	new_game_button.pressed.connect(_start)
	continue_button.pressed.connect(_continue)
	quit_button.pressed.connect(_quit)
	if DisplayServer.get_name() == "headless":
		visible = false
	else:
		get_tree().paused = true
	var save = Game.get_service("save")
	continue_button.disabled = not (save and save.has_save())

func _start() -> void:
	visible = false
	get_tree().paused = false

func _continue() -> void:
	var save = Game.get_service("save")
	if save and save.load_game():
		visible = false
		get_tree().paused = false

func _quit() -> void:
	get_tree().quit()

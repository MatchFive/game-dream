extends CanvasLayer

@onready var resume_button: Button = $Panel/VBox/Resume
@onready var save_button: Button = $Panel/VBox/Save
@onready var quit_button: Button = $Panel/VBox/Quit

func _ready() -> void:
	visible = false
	resume_button.pressed.connect(_resume)
	save_button.pressed.connect(_save)
	quit_button.pressed.connect(_quit)

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		if visible:
			_resume()
		else:
			visible = true
			get_tree().paused = true

func _resume() -> void:
	visible = false
	get_tree().paused = false

func _save() -> void:
	var save = Game.get_service("save")
	if save:
		save.save_game()

func _quit() -> void:
	get_tree().quit()

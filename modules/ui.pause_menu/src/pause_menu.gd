extends CanvasLayer

@onready var resume_button: Button = $Panel/VBox/Resume
@onready var save_button: Button = $Panel/VBox/Save
@onready var settings_button: Button = $Panel/VBox/Settings
@onready var quit_button: Button = $Panel/VBox/Quit

func _ready() -> void:
	visible = false
	add_to_group("pause_menu")
	resume_button.pressed.connect(_resume)
	save_button.pressed.connect(_save)
	settings_button.pressed.connect(_settings)
	quit_button.pressed.connect(_quit)

func _main_menu_open() -> bool:
	var menu = get_tree().get_first_node_in_group("main_menu")
	return menu != null and menu.visible

func _settings_open() -> bool:
	var settings = get_tree().get_first_node_in_group("settings")
	return settings != null and settings.visible

func _unhandled_input(event: InputEvent) -> void:
	if _settings_open():
		return
	if event.is_action_pressed("pause") and not _main_menu_open():
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
	var ok := bool(save.save_game()) if save else false
	save_button.text = "Saved" if ok else "Save failed"

func _settings() -> void:
	Game.events.emit_event("settings.open", {})

func _quit() -> void:
	get_tree().quit()

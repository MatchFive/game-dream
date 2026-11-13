extends CanvasLayer

@onready var title: Label = $Panel/VBox/Title
@onready var summary: Label = $Panel/VBox/Summary
@onready var restart_button: Button = $Panel/VBox/Restart
@onready var quit_button: Button = $Panel/VBox/Quit

func _ready() -> void:
	add_to_group("result_screen")
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false
	Game.events.event_emitted.connect(_on_event)
	restart_button.pressed.connect(_restart)
	quit_button.pressed.connect(_quit)

func _on_event(event_name: String, payload: Variant) -> void:
	if event_name == "game.won":
		_show("Victory", payload)
	elif event_name == "game.lost":
		_show("Defeat", payload)
	elif event_name == "run.reset" or event_name == "game.started":
		visible = false
		get_tree().paused = false

func _show(title_text: String, payload: Variant) -> void:
	var data: Dictionary = payload if payload is Dictionary else {}
	title.text = title_text
	summary.text = "Level %d  HP %d/%d" % [
		int(data.get("level", 1)),
		int(data.get("hp", 0)),
		int(data.get("max_hp", 0)),
	]
	visible = true
	get_tree().paused = true

func _restart() -> void:
	visible = false
	get_tree().paused = false
	Game.events.emit_event("game.restart", {})

func _quit() -> void:
	get_tree().quit()

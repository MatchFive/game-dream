extends CanvasLayer

@onready var speaker_label: Label = $Panel/VBox/Speaker
@onready var text_label: Label = $Panel/VBox/Text
@onready var next_button: Button = $Panel/VBox/Next

func _ready() -> void:
	visible = false
	Game.events.event_emitted.connect(_on_event)
	next_button.pressed.connect(_next)

func _on_event(event_name: String, payload: Variant) -> void:
	if event_name == "dialogue.line" and payload is Dictionary:
		visible = true
		speaker_label.text = str(payload.get("speaker", ""))
		text_label.text = str(payload.get("text", ""))
	elif event_name == "dialogue.finished":
		visible = false

func _next() -> void:
	var dialogue = Game.get_service("dialogue")
	if dialogue:
		dialogue.advance()

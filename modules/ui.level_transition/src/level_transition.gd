extends CanvasLayer

@onready var fade: ColorRect = $Fade

var _tween: Tween

func _ready() -> void:
	Game.events.event_emitted.connect(_on_event)

func _on_event(event_name: String, _payload: Variant) -> void:
	if event_name != "level.transition":
		return
	if _tween and _tween.is_valid():
		_tween.kill()
	fade.color = Color(0, 0, 0, 0)
	_tween = create_tween()
	_tween.tween_property(fade, "color:a", 0.65, 0.15)
	_tween.tween_property(fade, "color:a", 0.0, 0.2)

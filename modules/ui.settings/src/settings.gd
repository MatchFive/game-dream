extends CanvasLayer

@onready var music_slider: HSlider = $Panel/VBox/Music
@onready var sfx_slider: HSlider = $Panel/VBox/Sfx
@onready var fullscreen_check: CheckBox = $Panel/VBox/Fullscreen
@onready var back_button: Button = $Panel/VBox/Back

func _ready() -> void:
	add_to_group("settings")
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false
	Game.events.event_emitted.connect(_on_event)
	music_slider.value_changed.connect(_on_music_changed)
	sfx_slider.value_changed.connect(_on_sfx_changed)
	fullscreen_check.toggled.connect(_on_fullscreen_toggled)
	back_button.pressed.connect(_back)
	_sync()

func _on_event(event_name: String, _payload: Variant) -> void:
	if event_name == "settings.open":
		_sync()
		visible = true
	elif event_name == "settings.close":
		visible = false

func _sync() -> void:
	var settings = Game.get_service("settings")
	if settings == null:
		return
	music_slider.set_value_no_signal(float(settings.music_volume) * 100.0)
	sfx_slider.set_value_no_signal(float(settings.sfx_volume) * 100.0)
	fullscreen_check.set_pressed_no_signal(bool(settings.fullscreen))

func _unhandled_input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("pause"):
		get_viewport().set_input_as_handled()
		_back()

func _on_music_changed(value: float) -> void:
	var settings = Game.get_service("settings")
	if settings:
		settings.set_music_volume(value / 100.0)

func _on_sfx_changed(value: float) -> void:
	var settings = Game.get_service("settings")
	if settings:
		settings.set_sfx_volume(value / 100.0)

func _on_fullscreen_toggled(value: bool) -> void:
	var settings = Game.get_service("settings")
	if settings:
		settings.set_fullscreen(value)

func _back() -> void:
	visible = false
	Game.events.emit_event("settings.closed", {})

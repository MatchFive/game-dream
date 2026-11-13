extends Node

signal changed()

const PATH := "user://settings.json"
const TMP := "user://settings.json.tmp"

var music_volume: float = 0.3
var sfx_volume: float = 0.8
var fullscreen: bool = false

var _save_timer: Timer

func _ready() -> void:
	Game.register_service("settings", self)
	_save_timer = Timer.new()
	_save_timer.one_shot = true
	_save_timer.wait_time = 0.3
	_save_timer.timeout.connect(_on_save_timeout)
	add_child(_save_timer)
	_load()
	_apply_bus("Music", music_volume)
	_apply_bus("SFX", sfx_volume)
	_apply_fullscreen()

func _load() -> void:
	if not FileAccess.file_exists(PATH):
		return
	var data = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	if not data is Dictionary:
		return
	music_volume = clampf(float(data.get("music_volume", music_volume)), 0.0, 1.0)
	sfx_volume = clampf(float(data.get("sfx_volume", sfx_volume)), 0.0, 1.0)
	fullscreen = bool(data.get("fullscreen", fullscreen))

func save() -> bool:
	var file := FileAccess.open(TMP, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify({
		"music_volume": music_volume,
		"sfx_volume": sfx_volume,
		"fullscreen": fullscreen,
	}))
	if file.get_error() != OK:
		file.close()
		return false
	file.close()
	return DirAccess.rename_absolute(
		ProjectSettings.globalize_path(TMP),
		ProjectSettings.globalize_path(PATH),
	) == OK

func set_music_volume(value: float) -> void:
	music_volume = clampf(value, 0.0, 1.0)
	_apply_bus("Music", music_volume)
	_schedule_save()
	changed.emit()

func set_sfx_volume(value: float) -> void:
	sfx_volume = clampf(value, 0.0, 1.0)
	_apply_bus("SFX", sfx_volume)
	_schedule_save()
	changed.emit()

func set_fullscreen(value: bool) -> void:
	fullscreen = value
	_apply_fullscreen()
	_schedule_save()
	changed.emit()

func _schedule_save() -> void:
	if _save_timer:
		_save_timer.start()
	else:
		_on_save_timeout()

func _on_save_timeout() -> void:
	if not save():
		push_warning("settings: failed to save user://settings.json")

func _apply_bus(bus_name: String, value: float) -> void:
	var index := AudioServer.get_bus_index(bus_name)
	if index < 0:
		return
	AudioServer.set_bus_volume_db(index, linear_to_db(maxf(value, 0.0001)))

func _apply_fullscreen() -> void:
	if DisplayServer.get_name() == "headless":
		return
	var mode := DisplayServer.WINDOW_MODE_FULLSCREEN if fullscreen else DisplayServer.WINDOW_MODE_WINDOWED
	if DisplayServer.window_get_mode() != mode:
		DisplayServer.window_set_mode(mode)

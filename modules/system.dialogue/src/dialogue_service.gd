extends Node

var _lines: Array = []
var _index: int = 0
var _active: bool = false
var _current: Dictionary = {}

func _ready() -> void:
	Game.register_service("dialogue", self)

func start(dialogue_id: String) -> bool:
	var content = Game.get_service("content")
	if content == null:
		return false
	var data: Dictionary = content.get_dialogue(dialogue_id)
	var raw_lines = data.get("lines", [])
	_lines = raw_lines if raw_lines is Array else []
	_index = 0
	_current = {}
	_active = not _lines.is_empty()
	if _active:
		_emit_line()
	return _active

func advance() -> void:
	if not _active:
		return
	_index += 1
	if _index >= _lines.size():
		_active = false
		_current = {}
		Game.events.emit_event("dialogue.finished", {})
		return
	_emit_line()

func is_active() -> bool:
	return _active

func get_current_line() -> Dictionary:
	return _current

func _emit_line() -> void:
	var line = _lines[_index]
	var data: Dictionary = line if line is Dictionary else {}
	_current = {
		"speaker": str(data.get("speaker", "")),
		"text": str(data.get("text", "")),
		"index": _index,
		"total": _lines.size(),
	}
	Game.events.emit_event("dialogue.line", _current)

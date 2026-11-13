extends Node

const SAVE_PATH := "user://save.json"
const SAVE_TMP := "user://save.json.tmp"
const SAVE_BAK := "user://save.json.bak"
const SECTION_SERVICES := ["inventory", "progression", "equipment"]

func _ready() -> void:
	Game.register_service("save", self)

func _section_services() -> Array:
	var path := "res://game/_generated/save_sections.json"
	if FileAccess.file_exists(path):
		var data = JSON.parse_string(FileAccess.get_file_as_string(path))
		if typeof(data) == TYPE_DICTIONARY and data.get("sections") is Array:
			return data["sections"]
	return SECTION_SERVICES

func save_game() -> bool:
	var sections := {}
	for service_name in _section_services():
		var service = Game.get_service(str(service_name))
		if service and service.has_method("serialize"):
			sections[str(service_name)] = service.serialize()
	var payload := {"version": 1, "sections": sections}
	var file := FileAccess.open(SAVE_TMP, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(payload))
	if file.get_error() != OK:
		file.close()
		return false
	file.close()
	if FileAccess.file_exists(SAVE_PATH):
		DirAccess.copy_absolute(SAVE_PATH, SAVE_BAK)
	return DirAccess.rename_absolute(SAVE_TMP, SAVE_PATH) == OK

func load_game() -> bool:
	if not FileAccess.file_exists(SAVE_PATH):
		return false
	var payload = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
	if typeof(payload) != TYPE_DICTIONARY:
		return false
	var sections = payload.get("sections", {})
	if not sections is Dictionary:
		return false
	for service_name in sections.keys():
		var service = Game.get_service(str(service_name))
		if service and service.has_method("deserialize"):
			service.deserialize(sections[service_name])
	return true

func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)

extends Node

const SAVE_PATH := "user://save.json"
const SAVE_TMP := "user://save.json.tmp"
const SECTION_SERVICES := ["inventory", "progression", "equipment"]

func _ready() -> void:
	Game.register_service("save", self)

func save_game() -> bool:
	var sections := {}
	for service_name in SECTION_SERVICES:
		var service = Game.get_service(service_name)
		if service and service.has_method("serialize"):
			sections[service_name] = service.serialize()
	var payload := {"version": 1, "sections": sections}
	var file := FileAccess.open(SAVE_TMP, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(payload))
	file.close()
	if FileAccess.file_exists(SAVE_PATH):
		DirAccess.remove_absolute(SAVE_PATH)
	return DirAccess.rename_absolute(SAVE_TMP, SAVE_PATH) == OK

func load_game() -> bool:
	if not FileAccess.file_exists(SAVE_PATH):
		return false
	var payload = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
	if typeof(payload) != TYPE_DICTIONARY:
		return false
	var sections: Dictionary = payload.get("sections", {})
	for service_name in sections.keys():
		var service = Game.get_service(str(service_name))
		if service and service.has_method("deserialize"):
			service.deserialize(sections[service_name])
	return true

func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)

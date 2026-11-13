extends Node

var items: Dictionary = {}
var skills: Dictionary = {}
var loot_tables: Dictionary = {}

func _ready() -> void:
	Game.register_service("content", self)
	_load_dir("items", items)
	_load_dir("skills", skills)
	_load_dir("loot", loot_tables)

func _load_dir(folder: String, target: Dictionary) -> void:
	var path := "res://game/content/%s" % folder
	var dir := DirAccess.open(path)
	if dir == null:
		return
	dir.list_dir_begin()
	var file := dir.get_next()
	while file != "":
		if not dir.current_is_dir() and file.ends_with(".json"):
			var raw := FileAccess.get_file_as_string(path + "/" + file)
			var data = JSON.parse_string(raw)
			if typeof(data) == TYPE_DICTIONARY and data.has("id"):
				target[data["id"]] = data
		file = dir.get_next()
	dir.list_dir_end()

func get_item(id: String) -> Dictionary:
	return items.get(id, {})

func get_skill(id: String) -> Dictionary:
	return skills.get(id, {})

func get_loot_table(id: String) -> Dictionary:
	return loot_tables.get(id, {})

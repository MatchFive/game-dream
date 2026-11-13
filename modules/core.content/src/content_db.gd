extends Node

var items: Dictionary = {}
var skills: Dictionary = {}
var loot_tables: Dictionary = {}
var quests: Dictionary = {}
var dialogue: Dictionary = {}

func _ready() -> void:
	Game.register_service("content", self)
	_load_dir("items", items)
	_load_dir("skills", skills)
	_load_dir("loot", loot_tables)
	_load_dir("loot_tables", loot_tables, false)
	_load_dir("quests", quests)
	_load_dir("dialogue", dialogue)

func _load_dir(folder: String, target: Dictionary, warn_missing: bool = true) -> void:
	var path := "res://game/content/%s" % folder
	var dir := DirAccess.open(path)
	if dir == null:
		if warn_missing:
			push_warning("content: missing directory %s" % path)
		return
	dir.list_dir_begin()
	var file := dir.get_next()
	while file != "":
		if not dir.current_is_dir() and file.ends_with(".json"):
			var raw := FileAccess.get_file_as_string(path + "/" + file)
			var data = JSON.parse_string(raw)
			if typeof(data) == TYPE_DICTIONARY and data.has("id"):
				if folder == "quests" and not data.get("objective") is Dictionary:
					push_warning("content: quest missing objective in %s/%s" % [path, file])
				if folder == "dialogue" and not data.get("lines") is Array:
					push_warning("content: dialogue missing lines in %s/%s" % [path, file])
				target[data["id"]] = data
			else:
				push_warning("content: invalid JSON in %s/%s" % [path, file])
		file = dir.get_next()
	dir.list_dir_end()

func get_item(id: String) -> Dictionary:
	return items.get(id, {})

func get_skill(id: String) -> Dictionary:
	return skills.get(id, {})

func get_loot_table(id: String) -> Dictionary:
	return loot_tables.get(id, {})

func get_quest(id: String) -> Dictionary:
	return quests.get(id, {})

func get_dialogue(id: String) -> Dictionary:
	return dialogue.get(id, {})

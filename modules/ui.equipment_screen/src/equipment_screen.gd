extends CanvasLayer

@onready var list: VBoxContainer = $Panel/VBox/List

func _ready() -> void:
	visible = false
	var equipment = Game.get_service("equipment")
	if equipment:
		equipment.changed.connect(_rebuild)
	_rebuild()

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("toggle_equipment"):
		visible = not visible
		if visible:
			_rebuild()

func _rebuild() -> void:
	for child in list.get_children():
		child.queue_free()
	var equipment = Game.get_service("equipment")
	if equipment == null:
		return
	var content = Game.get_service("content")
	for slot in ["weapon", "armor", "trinket"]:
		var item_id: String = equipment.get_equipped(slot)
		var display := "-"
		if item_id != "" and content:
			display = str(content.get_item(item_id).get("name", item_id))
		var label := Label.new()
		label.text = "%s: %s" % [slot, display]
		list.add_child(label)
	var bonuses := Label.new()
	bonuses.text = "Attack +%d / Max HP +%d" % [
		equipment.get_bonus("attack_damage"),
		equipment.get_bonus("max_hp"),
	]
	list.add_child(bonuses)

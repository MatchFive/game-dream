extends CanvasLayer

@onready var list: VBoxContainer = $Panel/VBox/List

func _ready() -> void:
	visible = false
	var inventory = Game.get_service("inventory")
	if inventory:
		inventory.changed.connect(_rebuild)
	var equipment = Game.get_service("equipment")
	if equipment:
		equipment.changed.connect(_rebuild)
	_rebuild()

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("toggle_inventory"):
		visible = not visible
		if visible:
			_rebuild()

func _rebuild() -> void:
	for child in list.get_children():
		child.queue_free()
	var inventory = Game.get_service("inventory")
	var content = Game.get_service("content")
	if inventory == null or content == null:
		return
	for item_id in inventory.items().keys():
		var id := str(item_id)
		var item: Dictionary = content.get_item(id)
		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = "%s x%d" % [item.get("name", id), inventory.count(id)]
		row.add_child(label)
		if item.has("slot"):
			var equipment = Game.get_service("equipment")
			if equipment:
				var button := Button.new()
				button.text = "Equip"
				button.pressed.connect(func() -> void:
					equipment.equip(id)
					_rebuild()
				)
				row.add_child(button)
		list.add_child(row)

extends CanvasLayer

@onready var label: Label = $Panel/Label

func _ready() -> void:
	Game.service_registered.connect(_on_service_registered)
	if Game.has_service("inventory"):
		_bind_inventory(Game.get_service("inventory"))

func _on_service_registered(service_name: String, service: Node) -> void:
	if service_name == "inventory":
		_bind_inventory(service)

func _bind_inventory(inventory: Node) -> void:
	inventory.changed.connect(_update_label)
	_update_label()

func _update_label() -> void:
	var inventory := Game.get_service("inventory")
	if inventory == null:
		label.text = "Inventory: -"
		return
	label.text = "Inventory: %d" % inventory.total_count()

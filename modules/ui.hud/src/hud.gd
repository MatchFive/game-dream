extends CanvasLayer

@onready var inventory_label: Label = $Panel/VBox/Inventory
@onready var hp_label: Label = $Panel/VBox/HP

func _ready() -> void:
	Game.service_registered.connect(_on_service_registered)
	if Game.events:
		Game.events.event_emitted.connect(_on_event)
	if Game.has_service("inventory"):
		_bind_inventory(Game.get_service("inventory"))

func _on_service_registered(service_name: String, service: Node) -> void:
	if service_name == "inventory":
		_bind_inventory(service)

func _bind_inventory(inventory: Node) -> void:
	inventory.changed.connect(_update_inventory)
	_update_inventory()

func _update_inventory() -> void:
	var inventory := Game.get_service("inventory")
	if inventory == null:
		inventory_label.text = "Inventory: -"
		return
	inventory_label.text = "Inventory: %d" % inventory.total_count()

func _on_event(event_name: String, payload: Variant) -> void:
	if event_name == "player.health_changed":
		hp_label.text = "HP: %d/%d" % [int(payload["hp"]), int(payload["max_hp"])]

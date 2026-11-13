extends CanvasLayer

@onready var inventory_label: Label = $Panel/VBox/Inventory
@onready var hp_label: Label = $Panel/VBox/HP
@onready var level_label: Label = $Panel/VBox/Level

func _ready() -> void:
	Game.service_registered.connect(_on_service_registered)
	if Game.events:
		Game.events.event_emitted.connect(_on_event)
	if Game.has_service("inventory"):
		_bind_inventory(Game.get_service("inventory"))
	_bind_player_health()
	_bind_progression()

func _bind_progression() -> void:
	var progression = Game.get_service("progression")
	if progression == null:
		level_label.text = "Level: -"
		return
	progression.changed.connect(_on_progression_changed)
	_on_progression_changed(progression.level, progression.xp)

func _on_progression_changed(level: int, xp: int) -> void:
	var progression = Game.get_service("progression")
	var next := int(progression.xp_to_next) if progression else 0
	level_label.text = "Level: %d XP: %d/%d" % [level, xp, next]

func _bind_player_health() -> void:
	var player = get_tree().get_first_node_in_group("player")
	if player == null:
		return
	var health = player.get_node_or_null("Health")
	if health == null:
		return
	health.health_changed.connect(_on_health_changed)
	_on_health_changed(health.hp, health.max_hp)

func _on_health_changed(hp: int, max_hp: int) -> void:
	hp_label.text = "HP: %d/%d" % [hp, max_hp]

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
		_on_health_changed(int(payload["hp"]), int(payload["max_hp"]))

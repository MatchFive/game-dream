extends CanvasLayer

@onready var list: VBoxContainer = $Panel/VBox/List

func _ready() -> void:
	visible = false
	_rebuild()

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("toggle_skills"):
		visible = not visible
		if visible:
			_rebuild()

func _rebuild() -> void:
	for child in list.get_children():
		child.queue_free()
	var content = Game.get_service("content")
	if content == null:
		return
	for skill_id in content.skills.keys():
		var skill: Dictionary = content.get_skill(str(skill_id))
		var label := Label.new()
		label.text = "%s - %d dmg, %.1fs cd" % [
			skill.get("name", skill_id),
			int(skill.get("damage", 0)),
			float(skill.get("cooldown", 0.0)),
		]
		list.add_child(label)

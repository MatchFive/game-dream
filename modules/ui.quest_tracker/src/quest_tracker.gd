extends CanvasLayer

@onready var label: Label = $Panel/Label

func _ready() -> void:
	Game.events.event_emitted.connect(_on_event)
	_refresh()

func _on_event(event_name: String, _payload: Variant) -> void:
	if event_name.begins_with("quest."):
		_refresh()

func _refresh() -> void:
	var quests = Game.get_service("quests")
	if quests == null:
		label.text = ""
		return
	var lines := []
	for quest in quests.get_active():
		var mark := "done" if quest["completed"] else "%d/%d" % [quest["progress"], quest["count"]]
		lines.append("%s  %s" % [quest["title"], mark])
	label.text = "\n".join(lines)

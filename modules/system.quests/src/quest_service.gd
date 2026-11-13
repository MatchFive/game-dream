extends Node

signal changed()

var quests: Dictionary = {}
var completed_count: int = 0

func _ready() -> void:
	Game.register_service("quests", self)
	Game.events.event_emitted.connect(_on_event)
	var content = Game.get_service("content")
	if content:
		for quest_id in content.quests.keys():
			quests[str(quest_id)] = {
				"data": content.get_quest(str(quest_id)),
				"progress": 0,
				"completed": false,
			}

func _on_event(event_name: String, payload: Variant) -> void:
	if event_name != "enemy.died" or not payload is Dictionary:
		return
	var kind := str(payload.get("kind", ""))
	for quest_id in quests.keys():
		var state: Dictionary = quests[quest_id]
		if state["completed"]:
			continue
		var data: Dictionary = state["data"]
		var objective_value = data.get("objective", {})
		var objective: Dictionary = objective_value if objective_value is Dictionary else {}
		if str(objective.get("type", "")) != "kill":
			continue
		if str(objective.get("target", "")) != kind:
			continue
		state["progress"] = int(state["progress"]) + 1
		var complete := int(state["progress"]) >= int(objective.get("count", 1))
		state["completed"] = complete
		if complete:
			completed_count += 1
			_grant_reward(data)
		Game.events.emit_event("quest.changed", {
			"quest": str(quest_id),
			"progress": state["progress"],
			"completed": complete,
		})
		if complete:
			Game.events.emit_event("quest.completed", {"quest": str(quest_id)})
	changed.emit()

func _grant_reward(data: Dictionary) -> void:
	var reward_value = data.get("reward", {})
	var reward: Dictionary = reward_value if reward_value is Dictionary else {}
	var xp := int(reward.get("xp", 0))
	if xp <= 0:
		return
	var progression = Game.get_service("progression")
	if progression:
		progression.add_xp(xp)

func get_active() -> Array:
	var result := []
	for quest_id in quests.keys():
		var state: Dictionary = quests[quest_id]
		var data: Dictionary = state["data"]
		var objective_value = data.get("objective", {})
		var objective: Dictionary = objective_value if objective_value is Dictionary else {}
		result.append({
			"id": str(quest_id),
			"title": str(data.get("title", quest_id)),
			"progress": int(state["progress"]),
			"count": int(objective.get("count", 1)),
			"completed": bool(state["completed"]),
		})
	return result

func reset() -> void:
	completed_count = 0
	for quest_id in quests.keys():
		quests[quest_id]["progress"] = 0
		quests[quest_id]["completed"] = false
	changed.emit()
	Game.events.emit_event("quest.changed", {})

func serialize() -> Dictionary:
	var states := {}
	for quest_id in quests.keys():
		var state: Dictionary = quests[quest_id]
		states[str(quest_id)] = {
			"progress": int(state["progress"]),
			"completed": bool(state["completed"]),
		}
	return {"quests": states}

func deserialize(data: Dictionary) -> void:
	var states_value = data.get("quests", {})
	var states: Dictionary = states_value if states_value is Dictionary else {}
	completed_count = 0
	for quest_id in quests.keys():
		var state: Dictionary = quests[quest_id]
		if states.has(quest_id):
			var saved: Dictionary = states[quest_id]
			state["progress"] = int(saved.get("progress", 0))
			state["completed"] = bool(saved.get("completed", false))
		if state["completed"]:
			completed_count += 1
	changed.emit()

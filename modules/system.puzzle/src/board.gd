extends Node2D

const LEVELS := [
	[
		"########",
		"#      #",
		"# .$@  #",
		"#      #",
		"########",
	],
	[
		"########",
		"#   .  #",
		"#   $  #",
		"#   @  #",
		"########",
	],
]
const DIRECTIONS := {
	"left": Vector2i(-1, 0),
	"right": Vector2i(1, 0),
	"up": Vector2i(0, -1),
	"down": Vector2i(0, 1),
}
const TILE := 56.0
const OFFSET := Vector2(320, 180)

var walls: Dictionary = {}
var targets: Array = []
var boxes: Array = []
var player_cell := Vector2i.ZERO
var level_index := 0
var finished := false
var autoplay := false
var pushed_once := false
var solution: Array = []
var solution_index := 0
var turn_timer := 0.15
var hud: Label

func _ready() -> void:
	_build_hud()
	autoplay = DisplayServer.get_name() == "headless"
	_load_level(0)

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 5
	add_child(layer)
	hud = Label.new()
	hud.position = Vector2(20, 20)
	layer.add_child(hud)

func _load_level(index: int) -> void:
	walls.clear()
	targets.clear()
	boxes.clear()
	level_index = index
	var rows: Array = LEVELS[index]
	for y in range(rows.size()):
		var row: String = rows[y]
		for x in range(row.length()):
			var tile: String = row[x]
			var cell := Vector2i(x, y)
			if tile == "#":
				walls[cell] = true
			elif tile == ".":
				targets.append(cell)
			elif tile == "$":
				boxes.append(cell)
			elif tile == "@":
				player_cell = cell
	solution.clear()
	solution_index = 0
	turn_timer = 0.15
	if autoplay:
		solution = _solve()
	_update_hud()
	queue_redraw()

func _draw() -> void:
	draw_rect(Rect2(Vector2(-100, -100), Vector2(1400, 900)), Color(0.04, 0.05, 0.08))
	var rows: Array = LEVELS[level_index]
	for y in range(rows.size()):
		var row: String = rows[y]
		for x in range(row.length()):
			var cell := Vector2i(x, y)
			var rect := Rect2(OFFSET + Vector2(x, y) * TILE, Vector2(TILE - 3, TILE - 3))
			var color := Color(0.18, 0.2, 0.26)
			if walls.has(cell):
				color = Color(0.34, 0.38, 0.46)
			draw_rect(rect, color)
	for target in targets:
		draw_circle(OFFSET + Vector2(target) * TILE + Vector2(TILE / 2, TILE / 2), 10.0, Color(0.3, 0.9, 0.45))
	for box in boxes:
		draw_rect(
			Rect2(OFFSET + Vector2(box) * TILE + Vector2(9, 9), Vector2(TILE - 21, TILE - 21)),
			Color(0.78, 0.52, 0.24),
		)
	draw_rect(
		Rect2(OFFSET + Vector2(player_cell) * TILE + Vector2(12, 12), Vector2(TILE - 27, TILE - 27)),
		Color(0.3, 0.75, 1.0),
	)

func _process(delta: float) -> void:
	if finished:
		return
	if Input.is_action_just_pressed("restart"):
		_load_level(level_index)
		return
	if autoplay:
		turn_timer -= delta
		if turn_timer <= 0.0:
			turn_timer = 0.12
			if solution_index < solution.size():
				var action: String = solution[solution_index]
				solution_index += 1
				_move(action)
		return
	var inputs := {
		"move_up": "up",
		"move_down": "down",
		"move_left": "left",
		"move_right": "right",
	}
	for action in inputs:
		if Input.is_action_just_pressed(action):
			_move(inputs[action])
			return

func _move(action: String) -> bool:
	var direction: Vector2i = DIRECTIONS[action]
	var target: Vector2i = player_cell + direction
	if walls.has(target):
		return false
	var box_index := _box_index(boxes, target)
	if box_index >= 0:
		var beyond: Vector2i = target + direction
		if walls.has(beyond) or _box_index(boxes, beyond) >= 0:
			return false
		boxes[box_index] = beyond
		if not pushed_once:
			print("GAMEDREAM_PUSH")
			pushed_once = true
	player_cell = target
	_update_hud()
	queue_redraw()
	if _is_solved(boxes):
		_advance_level()
	return true

func _advance_level() -> void:
	if level_index + 1 >= LEVELS.size():
		_finish(true)
	else:
		_load_level(level_index + 1)

func _solve() -> Array:
	var start_boxes: Array = boxes.duplicate()
	if _is_solved(start_boxes):
		return []
	var visited: Dictionary = {}
	visited[_state_key(player_cell, start_boxes)] = true
	var queue: Array = [{"player": player_cell, "boxes": start_boxes, "path": []}]
	var visited_count := 0
	while not queue.is_empty() and visited_count < 25000:
		var entry: Dictionary = queue.pop_front()
		visited_count += 1
		var entry_player: Vector2i = entry["player"]
		var entry_boxes: Array = entry["boxes"]
		var entry_path: Array = entry["path"]
		for direction_name in DIRECTIONS.keys():
			var direction: Vector2i = DIRECTIONS[direction_name]
			var target: Vector2i = entry_player + direction
			if walls.has(target):
				continue
			var next_boxes: Array = entry_boxes.duplicate()
			var box_index := _box_index(next_boxes, target)
			if box_index >= 0:
				var beyond: Vector2i = target + direction
				if walls.has(beyond) or _box_index(next_boxes, beyond) >= 0:
					continue
				next_boxes[box_index] = beyond
			var next_path: Array = entry_path.duplicate()
			next_path.append(direction_name)
			if _is_solved(next_boxes):
				return next_path
			var key := _state_key(target, next_boxes)
			if visited.has(key):
				continue
			visited[key] = true
			queue.append({"player": target, "boxes": next_boxes, "path": next_path})
	return []

func _state_key(player: Vector2i, box_cells: Array) -> String:
	var sorted: Array = box_cells.duplicate()
	sorted.sort_custom(_box_less)
	var parts: Array = []
	for box in sorted:
		var cell: Vector2i = box
		parts.append("%d,%d" % [cell.x, cell.y])
	return "%d,%d|%s" % [player.x, player.y, ";".join(parts)]

func _box_less(a: Vector2i, b: Vector2i) -> bool:
	if a.y == b.y:
		return a.x < b.x
	return a.y < b.y

func _box_index(box_cells: Array, cell: Vector2i) -> int:
	for i in range(box_cells.size()):
		var box: Vector2i = box_cells[i]
		if box == cell:
			return i
	return -1

func _is_solved(box_cells: Array) -> bool:
	for target in targets:
		if not box_cells.has(target):
			return false
	return true

func _update_hud() -> void:
	if hud == null:
		return
	hud.text = "Level %d/%d   WASD move · R restart" % [
		level_index + 1,
		LEVELS.size(),
	]

func _finish(won: bool) -> void:
	if finished:
		return
	finished = true
	if won:
		print("GAMEDREAM_WIN")
	else:
		print("GAMEDREAM_LOSE")
	await get_tree().process_frame
	get_tree().quit(0 if won else 1)

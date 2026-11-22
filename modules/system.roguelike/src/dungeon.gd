extends Node2D

const GRID_WIDTH := 25
const GRID_HEIGHT := 17
const TILE := 28.0
const OFFSET := Vector2(90, 90)
const START := Vector2i(1, 1)
const SEED := 1337
const ROOM_COUNT := 3
const ROOM_NAMES := ["Entry Hall", "Ash Market", "Vault"]
const PLAYER_HP := 6
const DIRECTIONS := {
	"up": Vector2i(0, -1),
	"down": Vector2i(0, 1),
	"left": Vector2i(-1, 0),
	"right": Vector2i(1, 0),
}

var grid: Array = []
var player_cell := START
var exit_cell := START
var player_hp := PLAYER_HP
var enemies: Array = []
var killed := 0
var room_index := 0
var gold := 0
var relics: Array = []
var room_events: Array = []
var finished := false
var autoplay := false
var turn_timer := 0.0
var hud: Label
var rng := RandomNumberGenerator.new()

func _ready() -> void:
	_enter_room()
	_build_hud()
	autoplay = DisplayServer.get_name() == "headless"
	print("GAMEDREAM_DUNGEON")
	queue_redraw()

func _enter_room() -> void:
	player_cell = START
	enemies.clear()
	rng.seed = SEED + room_index * 97
	_build_dungeon()
	if room_index == 1:
		gold += 1
		room_events.append("market:cache")
		print("GAMEDREAM_CACHE")
	elif room_index == 2:
		for y in range(1, GRID_HEIGHT - 1):
			for x in range(1, GRID_WIDTH - 1):
				var cell := Vector2i(x, y)
				if _is_floor(cell) and cell != START and cell != exit_cell and _enemy_at(cell) < 0:
					enemies.append({"cell": cell})
					room_events.append("vault:ambush")
					print("GAMEDREAM_AMBUSH")
					break
			if room_events.has("vault:ambush"):
				break
	player_hp = mini(PLAYER_HP, player_hp + (1 if room_index > 0 else 0))
	print("GAMEDREAM_ROOM=%s" % ROOM_NAMES[room_index])
	print("ROGUELIKE_ROOM=%s" % room_index)

func _build_dungeon() -> void:
	grid = []
	for y in GRID_HEIGHT:
		var row: Array = []
		for x in GRID_WIDTH:
			row.append(0)
		grid.append(row)

	var stack: Array = [START]
	grid[START.y][START.x] = 1
	while not stack.is_empty():
		var current: Vector2i = stack.back()
		var options: Array = []
		for direction in DIRECTIONS.values():
			var next: Vector2i = current + direction * 2
			if (
				next.x > 0
				and next.x < GRID_WIDTH - 1
				and next.y > 0
				and next.y < GRID_HEIGHT - 1
				and grid[next.y][next.x] == 0
			):
				options.append(next)
		if options.is_empty():
			stack.pop_back()
		else:
			var next: Vector2i = options[rng.randi_range(0, options.size() - 1)]
			var wall := Vector2i(
				int((current.x + next.x) / 2),
				int((current.y + next.y) / 2),
			)
			grid[wall.y][wall.x] = 1
			grid[next.y][next.x] = 1
			stack.append(next)

	var distances := _bfs_distances(START)
	var best_distance := -1
	for cell in distances.keys():
		var distance: int = distances[cell]
		if distance > best_distance:
			best_distance = distance
			exit_cell = cell

	for direction in DIRECTIONS.values():
		var neighbor: Vector2i = START + direction
		if _is_floor(neighbor):
			enemies.append({"cell": neighbor})
			break

	var candidates: Array = []
	for y in range(1, GRID_HEIGHT - 1):
		for x in range(1, GRID_WIDTH - 1):
			var cell := Vector2i(x, y)
			if not _is_floor(cell) or cell == START or cell == exit_cell:
				continue
			if _enemy_at(cell) >= 0:
				continue
			var distance := absi(cell.x - START.x) + absi(cell.y - START.y)
			if distance > 6:
				candidates.append(cell)
	if not candidates.is_empty():
		enemies.append({"cell": candidates[rng.randi_range(0, candidates.size() - 1)]})

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 5
	add_child(layer)
	hud = Label.new()
	hud.position = Vector2(20, 20)
	layer.add_child(hud)
	_update_hud()

func _draw() -> void:
	var board_size := Vector2(GRID_WIDTH * TILE, GRID_HEIGHT * TILE)
	draw_rect(
		Rect2(OFFSET - Vector2(40, 40), board_size + Vector2(80, 80)),
		Color(0.04, 0.05, 0.08),
	)
	for y in GRID_HEIGHT:
		for x in GRID_WIDTH:
			var color := Color(0.10, 0.12, 0.17)
			if grid[y][x] == 0:
				color = Color(0.28, 0.31, 0.38)
			draw_rect(
				Rect2(OFFSET + Vector2(x * TILE, y * TILE), Vector2(TILE - 2, TILE - 2)),
				color,
			)

	draw_rect(
		Rect2(
			OFFSET + Vector2(exit_cell.x * TILE, exit_cell.y * TILE) + Vector2(3, 3),
			Vector2(TILE - 8, TILE - 8),
		),
		Color(0.3, 0.9, 0.45),
	)
	for enemy in enemies:
		var cell: Vector2i = enemy["cell"]
		draw_rect(
			Rect2(
				OFFSET + Vector2(cell.x * TILE, cell.y * TILE) + Vector2(4, 4),
				Vector2(TILE - 10, TILE - 10),
			),
			Color(0.95, 0.3, 0.3),
		)
	draw_rect(
		Rect2(
			OFFSET + Vector2(player_cell.x * TILE, player_cell.y * TILE) + Vector2(3, 3),
			Vector2(TILE - 8, TILE - 8),
		),
		Color(0.3, 0.75, 1.0),
	)

func _process(delta: float) -> void:
	if finished:
		return
	if Input.is_action_just_pressed("restart"):
		get_tree().reload_current_scene()
		return
	if autoplay:
		turn_timer -= delta
		if turn_timer <= 0.0:
			turn_timer = 0.02
			_take_turn(_auto_action())
		return
	var inputs := {
		"move_up": "up",
		"move_down": "down",
		"move_left": "left",
		"move_right": "right",
	}
	for action in inputs:
		if Input.is_action_just_pressed(action):
			_take_turn(inputs[action])
			return

func _take_turn(action: String) -> void:
	if finished or action == "wait":
		return
	var direction: Vector2i = DIRECTIONS[action]
	var target: Vector2i = player_cell + direction
	var enemy_index := _enemy_at(target)
	if enemy_index >= 0:
		enemies.remove_at(enemy_index)
		killed += 1
		if killed == 1:
			print("GAMEDREAM_KILL")
		_enemy_turn()
		_after_turn()
		return
	if _is_floor(target):
		player_cell = target
		if player_cell == exit_cell:
			if room_index + 1 >= ROOM_COUNT:
				_finish(true)
			else:
				_next_room()
			return
		_enemy_turn()
		_after_turn()

func _next_room() -> void:
	gold += 5
	if room_index == 0 and gold >= 5:
		gold -= 5
		relics.append("ember")
		player_hp = mini(PLAYER_HP, player_hp + 1)
		print("GAMEDREAM_RELIC=ember")
		print("ROGUELIKE_RELIC=ember")
	room_index += 1
	_enter_room()
	_after_turn()

func _enemy_turn() -> void:
	for i in range(enemies.size() - 1, -1, -1):
		if i >= enemies.size():
			continue
		var cell: Vector2i = enemies[i]["cell"]
		var distance := absi(cell.x - player_cell.x) + absi(cell.y - player_cell.y)
		if distance == 1:
			player_hp -= 1
			continue
		var next := _next_step(cell, player_cell)
		if next != cell and next != player_cell and _enemy_at(next) < 0:
			enemies[i]["cell"] = next

func _after_turn() -> void:
	_update_hud()
	queue_redraw()
	if player_hp <= 0:
		_finish(false)

func _auto_action() -> String:
	var adjacent: Variant = _adjacent_enemy()
	if adjacent != null:
		return _direction_to(player_cell, adjacent)
	var target: Variant = _nearest_enemy_cell()
	if target != null:
		var next := _next_step(player_cell, target)
		if next != player_cell:
			return _direction_to(player_cell, next)
	var next_exit := _next_step(player_cell, exit_cell)
	if next_exit != player_cell:
		return _direction_to(player_cell, next_exit)
	return "wait"

func _direction_to(from: Vector2i, to: Vector2i) -> String:
	if to.x > from.x:
		return "right"
	if to.x < from.x:
		return "left"
	if to.y > from.y:
		return "down"
	if to.y < from.y:
		return "up"
	return "wait"

func _adjacent_enemy() -> Variant:
	for direction in DIRECTIONS.values():
		var cell: Vector2i = player_cell + direction
		if _enemy_at(cell) >= 0:
			return cell
	return null

func _nearest_enemy_cell() -> Variant:
	var best: Variant = null
	var best_distance := 999999
	for enemy in enemies:
		var cell: Vector2i = enemy["cell"]
		var distance := absi(cell.x - player_cell.x) + absi(cell.y - player_cell.y)
		if distance < best_distance:
			best_distance = distance
			best = cell
	return best

func _next_step(start: Vector2i, target: Vector2i) -> Vector2i:
	if start == target:
		return start
	var previous: Dictionary = {start: start}
	var queue: Array = [start]
	while not queue.is_empty():
		var current: Vector2i = queue.pop_front()
		for direction in DIRECTIONS.values():
			var next: Vector2i = current + direction
			if not _is_floor(next) or previous.has(next):
				continue
			previous[next] = current
			if next == target:
				var step: Vector2i = target
				while previous[step] != start:
					var prior: Vector2i = previous[step]
					step = prior
				return step
			queue.append(next)
	return start

func _bfs_distances(start: Vector2i) -> Dictionary:
	var distances: Dictionary = {start: 0}
	var queue: Array = [start]
	while not queue.is_empty():
		var current: Vector2i = queue.pop_front()
		for direction in DIRECTIONS.values():
			var next: Vector2i = current + direction
			if _is_floor(next) and not distances.has(next):
				distances[next] = int(distances[current]) + 1
				queue.append(next)
	return distances

func _is_floor(cell: Vector2i) -> bool:
	return (
		cell.x >= 0
		and cell.x < GRID_WIDTH
		and cell.y >= 0
		and cell.y < GRID_HEIGHT
		and grid[cell.y][cell.x] == 1
	)

func _enemy_at(cell: Vector2i) -> int:
	for i in range(enemies.size()):
		var enemy_cell: Vector2i = enemies[i]["cell"]
		if enemy_cell == cell:
			return i
	return -1

func _update_hud() -> void:
	if hud == null:
		return
	var relic_text := ", ".join(PackedStringArray(relics)) if not relics.is_empty() else "—"
	hud.text = "Room %d/%d %s   HP %d   Enemies %d   Gold %d   Relics %s   WASD move · R restart" % [
		room_index + 1,
		ROOM_COUNT,
		ROOM_NAMES[room_index],
		maxi(0, player_hp),
		enemies.size(),
		gold,
		relic_text,
	]

func _finish(won: bool) -> void:
	if finished:
		return
	finished = true
	if won:
		print("GAMEDREAM_WIN")
		print("ROGUELIKE_WIN")
	else:
		print("GAMEDREAM_LOSE")
	await get_tree().process_frame
	get_tree().quit(0 if won else 1)

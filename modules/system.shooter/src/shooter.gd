extends Node2D

const ARENA := Rect2(30, 30, 900, 480)
const PLAYER_SPEED := 260.0
const ENEMY_SPEED := 42.0
const BULLET_SPEED := 680.0
const FIRE_INTERVAL := 0.18
const PLAYER_RADIUS := 16.0
const ENEMY_RADIUS := 18.0
const TOTAL_WAVES := 5
const ENEMIES_PER_WAVE := 4
const SPAWNS := [
	Vector2(110, 100),
	Vector2(850, 100),
	Vector2(480, 80),
	Vector2(480, 440),
]

var player: Node2D
var hud: Label
var enemies: Array = []
var bullets: Array = []
var player_hp := 100.0
var killed := 0
var wave := 0
var total_enemies := TOTAL_WAVES * ENEMIES_PER_WAVE
var finished := false
var autoplay := false
var fire_cooldown := 0.0

func _ready() -> void:
	_build_level()
	autoplay = DisplayServer.get_name() == "headless"

func _build_level() -> void:
	var background := Polygon2D.new()
	background.color = Color(0.05, 0.06, 0.1)
	background.polygon = PackedVector2Array(
		[Vector2(-200, -200), Vector2(1200, -200), Vector2(1200, 800), Vector2(-200, 800)]
	)
	background.z_index = -10
	add_child(background)

	var border := Line2D.new()
	border.width = 4.0
	border.default_color = Color(0.2, 0.3, 0.45)
	border.points = PackedVector2Array(
		[
			ARENA.position,
			Vector2(ARENA.end.x, ARENA.position.y),
			ARENA.end,
			Vector2(ARENA.position.x, ARENA.end.y),
			ARENA.position,
		]
	)
	add_child(border)

	player = Polygon2D.new()
	player.color = Color(0.3, 0.75, 1.0)
	player.polygon = PackedVector2Array(
		[Vector2(0, -16), Vector2(14, 12), Vector2(0, 6), Vector2(-14, 12)]
	)
	player.position = Vector2(480, 270)
	add_child(player)

	var layer := CanvasLayer.new()
	layer.layer = 5
	add_child(layer)
	hud = Label.new()
	hud.position = Vector2(20, 20)
	layer.add_child(hud)
	_start_wave()

func _start_wave() -> void:
	if finished or wave >= TOTAL_WAVES:
		return
	wave += 1
	print("GAMEDREAM_WAVE")
	for i in ENEMIES_PER_WAVE:
		_spawn_enemy(SPAWNS[i])

func _spawn_enemy(position: Vector2) -> void:
	var node := Polygon2D.new()
	node.position = position
	node.color = Color(0.95, 0.3, 0.3)
	node.polygon = PackedVector2Array(
		[
			Vector2(0, -18),
			Vector2(13, -13),
			Vector2(18, 0),
			Vector2(13, 13),
			Vector2(0, 18),
			Vector2(-13, 13),
			Vector2(-18, 0),
			Vector2(-13, -13),
		]
	)
	add_child(node)
	enemies.append({"node": node, "hp": 2})

func _process(delta: float) -> void:
	if finished:
		return
	if Input.is_action_just_pressed("restart"):
		get_tree().reload_current_scene()
		return

	if not autoplay:
		var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
		player.position += direction * PLAYER_SPEED * delta
		player.position.x = clampf(player.position.x, ARENA.position.x + 20, ARENA.end.x - 20)
		player.position.y = clampf(player.position.y, ARENA.position.y + 20, ARENA.end.y - 20)

	fire_cooldown = maxf(0.0, fire_cooldown - delta)
	var firing := autoplay or Input.is_action_pressed("attack")
	if firing and fire_cooldown <= 0.0 and not enemies.is_empty():
		fire_cooldown = FIRE_INTERVAL
		_shoot()

	_update_enemies(delta)
	_update_bullets(delta)
	_update_hud()
	if player_hp <= 0.0:
		_finish(false)

func _shoot() -> void:
	var target := _nearest_enemy()
	if target == null:
		return
	var direction := (target.position - player.position).normalized()
	if direction == Vector2.ZERO:
		direction = Vector2.RIGHT
	var bullet := Polygon2D.new()
	bullet.position = player.position
	bullet.color = Color(1.0, 0.85, 0.25)
	bullet.polygon = PackedVector2Array(
		[Vector2(-4, -4), Vector2(4, -4), Vector2(4, 4), Vector2(-4, 4)]
	)
	add_child(bullet)
	bullets.append({"node": bullet, "velocity": direction * BULLET_SPEED})

func _nearest_enemy() -> Node2D:
	var best: Node2D = null
	var best_distance := INF
	for entry in enemies:
		var node: Node2D = entry["node"]
		if not is_instance_valid(node):
			continue
		var distance := player.position.distance_squared_to(node.position)
		if distance < best_distance:
			best = node
			best_distance = distance
	return best

func _update_enemies(delta: float) -> void:
	for entry in enemies:
		var node: Node2D = entry["node"]
		if not is_instance_valid(node):
			continue
		var offset: Vector2 = player.position - node.position
		var distance := offset.length()
		if distance > PLAYER_RADIUS + ENEMY_RADIUS:
			node.position += offset.normalized() * ENEMY_SPEED * delta
		else:
			player_hp -= 24.0 * delta

func _update_bullets(delta: float) -> void:
	for i in range(bullets.size() - 1, -1, -1):
		var bullet: Dictionary = bullets[i]
		var bullet_node: Node2D = bullet["node"]
		if not is_instance_valid(bullet_node):
			bullets.remove_at(i)
			continue
		bullet_node.position += bullet["velocity"] * delta
		if not ARENA.has_point(bullet_node.position):
			bullet_node.queue_free()
			bullets.remove_at(i)
			continue
		var hit := false
		for j in range(enemies.size() - 1, -1, -1):
			var entry: Dictionary = enemies[j]
			var enemy_node: Node2D = entry["node"]
			if not is_instance_valid(enemy_node):
				enemies.remove_at(j)
				continue
			if bullet_node.position.distance_to(enemy_node.position) <= ENEMY_RADIUS:
				hit = true
				entry["hp"] = int(entry["hp"]) - 1
				bullet_node.queue_free()
				bullets.remove_at(i)
				if int(entry["hp"]) <= 0:
					enemy_node.queue_free()
					enemies.remove_at(j)
					_on_enemy_killed()
				break
		if hit:
			continue

func _on_enemy_killed() -> void:
	killed += 1
	if killed == 1:
		print("GAMEDREAM_KILL")
	if enemies.is_empty():
		if wave < TOTAL_WAVES:
			_start_wave()
		else:
			_finish(true)

func _update_hud() -> void:
	if hud == null:
		return
	hud.text = "Wave %d/%d   Enemies %d/%d   HP %d   WASD move · Space/J shoot" % [
		wave,
		TOTAL_WAVES,
		killed,
		total_enemies,
		maxi(0, int(player_hp)),
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

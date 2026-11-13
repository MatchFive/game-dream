extends Node2D

const PATH := [
	Vector2(-40, 270),
	Vector2(250, 270),
	Vector2(250, 140),
	Vector2(540, 140),
	Vector2(540, 410),
	Vector2(800, 410),
	Vector2(800, 250),
	Vector2(1000, 250),
]
const TOWER_SPOTS := [Vector2(320, 210), Vector2(650, 330), Vector2(760, 330)]
const BUILD_COST := 25
const UPGRADE_COST := 20
const TOTAL_WAVES := 3
const ENEMIES_PER_WAVE := 2
const ENEMY_SPEED := 360.0
const BULLET_SPEED := 900.0
const START_GOLD := 100
const BASE_HP := 10

var enemies: Array = []
var bullets: Array = []
var towers: Array = []
var gold := START_GOLD
var base_hp := BASE_HP
var wave := 0
var wave_active := false
var wave_delay := 0.4
var finished := false
var autoplay := false
var hud: Label

func _ready() -> void:
	for spot in TOWER_SPOTS:
		towers.append({"pos": spot, "level": 0, "cooldown": 0.0})
	_build_hud()
	autoplay = DisplayServer.get_name() == "headless"
	if autoplay:
		_auto_manage()

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 5
	add_child(layer)
	hud = Label.new()
	hud.position = Vector2(20, 20)
	layer.add_child(hud)
	_update_hud()

func _draw() -> void:
	draw_rect(Rect2(Vector2(-100, -100), Vector2(1200, 800)), Color(0.04, 0.06, 0.09))
	draw_polyline(PackedVector2Array(PATH), Color(0.22, 0.18, 0.12), 42.0)
	draw_polyline(PackedVector2Array(PATH), Color(0.58, 0.48, 0.3), 30.0)
	draw_rect(Rect2(PATH[PATH.size() - 1] - Vector2(30, 30), Vector2(60, 60)), Color(0.3, 0.9, 0.45))

	for tower in towers:
		var level: int = tower["level"]
		var position: Vector2 = tower["pos"]
		var color := Color(0.28, 0.34, 0.42)
		if level > 0:
			color = Color(0.25, 0.68, 1.0)
		draw_circle(position, 18.0, color)
		if level > 0:
			draw_circle(position, 8.0 + level * 2.0, Color(1.0, 0.82, 0.3))
		for i in range(level):
			draw_arc(position, 24.0 + i * 4.0, 0.0, TAU, 16, Color(0.3, 0.7, 1.0), 2.0)

	for enemy in enemies:
		var position: Vector2 = enemy["pos"]
		var hp: int = enemy["hp"]
		var max_hp: int = enemy["max_hp"]
		draw_circle(position, 13.0, Color(0.95, 0.3, 0.3))
		draw_rect(
			Rect2(position + Vector2(-16, -24), Vector2(32, 5)),
			Color(0.2, 0.2, 0.25),
		)
		draw_rect(
			Rect2(position + Vector2(-16, -24), Vector2(32.0 * hp / max_hp, 5)),
			Color(0.95, 0.35, 0.3),
		)

	for bullet in bullets:
		draw_circle(bullet["pos"], 5.0, Color(1.0, 0.86, 0.3))

func _process(delta: float) -> void:
	if finished:
		return
	if Input.is_action_just_pressed("restart"):
		get_tree().reload_current_scene()
		return
	if autoplay:
		_auto_manage()
	else:
		if Input.is_action_just_pressed("build"):
			_build_next()
		if Input.is_action_just_pressed("upgrade"):
			_upgrade_next()
		if Input.is_action_just_pressed("start_wave"):
			_start_wave()

	_update_waves(delta)
	_update_towers(delta)
	_update_bullets(delta)
	_update_enemies(delta)
	_update_hud()
	queue_redraw()
	if base_hp <= 0:
		_finish(false)

func _auto_manage() -> void:
	while _build_next():
		pass
	while _upgrade_next():
		pass

func _build_next() -> bool:
	for tower in towers:
		if int(tower["level"]) > 0:
			continue
		if gold < BUILD_COST:
			return false
		gold -= BUILD_COST
		tower["level"] = 1
		tower["cooldown"] = 0.0
		return true
	return false

func _upgrade_next() -> bool:
	for tower in towers:
		var level: int = tower["level"]
		if level <= 0 or level >= 3 or gold < UPGRADE_COST:
			continue
		gold -= UPGRADE_COST
		tower["level"] = level + 1
		return true
	return false

func _start_wave() -> void:
	if wave_active or wave >= TOTAL_WAVES or finished:
		return
	wave += 1
	wave_active = true
	var hp := 2 + wave
	for i in ENEMIES_PER_WAVE:
		enemies.append({"pos": PATH[0], "waypoint": 1, "hp": hp, "max_hp": hp})
	if wave == 1:
		print("GAMEDREAM_WAVE")

func _update_waves(delta: float) -> void:
	if wave_active:
		if enemies.is_empty():
			wave_active = false
			if wave >= TOTAL_WAVES:
				_finish(true)
			else:
				wave_delay = 0.7
		return
	if autoplay and wave < TOTAL_WAVES:
		wave_delay -= delta
		if wave_delay <= 0.0:
			_start_wave()

func _update_towers(delta: float) -> void:
	for tower in towers:
		var level: int = tower["level"]
		if level <= 0:
			continue
		tower["cooldown"] = maxf(0.0, float(tower["cooldown"]) - delta)
		if float(tower["cooldown"]) > 0.0:
			continue
		var target: Variant = _target_in_range(tower["pos"], 150.0 + level * 25.0)
		if target == null:
			continue
		var target_position: Vector2 = target["pos"]
		var origin: Vector2 = tower["pos"]
		var direction := (target_position - origin).normalized()
		bullets.append({"pos": origin, "velocity": direction * BULLET_SPEED, "damage": level})
		tower["cooldown"] = maxf(0.25, 0.8 - level * 0.12)

func _target_in_range(origin: Vector2, radius: float) -> Variant:
	var best: Variant = null
	var best_distance := INF
	var radius_squared := radius * radius
	for enemy in enemies:
		var position: Vector2 = enemy["pos"]
		var distance := origin.distance_squared_to(position)
		if distance <= radius_squared and distance < best_distance:
			best = enemy
			best_distance = distance
	return best

func _update_bullets(delta: float) -> void:
	for i in range(bullets.size() - 1, -1, -1):
		var bullet: Dictionary = bullets[i]
		var position: Vector2 = bullet["pos"]
		position += bullet["velocity"] * delta
		bullet["pos"] = position
		if position.x < -60 or position.x > 1060 or position.y < -60 or position.y > 620:
			bullets.remove_at(i)
			continue
		var hit := false
		for j in range(enemies.size() - 1, -1, -1):
			var enemy: Dictionary = enemies[j]
			var enemy_position: Vector2 = enemy["pos"]
			if position.distance_to(enemy_position) > 18.0:
				continue
			enemy["hp"] = int(enemy["hp"]) - int(bullet["damage"])
			bullets.remove_at(i)
			hit = true
			if int(enemy["hp"]) <= 0:
				gold += 10
				enemies.remove_at(j)
			break
		if hit:
			continue

func _update_enemies(delta: float) -> void:
	for i in range(enemies.size() - 1, -1, -1):
		var enemy: Dictionary = enemies[i]
		var waypoint: int = enemy["waypoint"]
		if waypoint >= PATH.size():
			base_hp -= 1
			enemies.remove_at(i)
			continue
		var position: Vector2 = enemy["pos"]
		var target: Vector2 = PATH[waypoint]
		var offset := target - position
		var step := ENEMY_SPEED * delta
		if offset.length() <= step:
			enemy["pos"] = target
			enemy["waypoint"] = waypoint + 1
		else:
			enemy["pos"] = position + offset.normalized() * step

func _update_hud() -> void:
	if hud == null:
		return
	hud.text = "Wave %d/%d   Gold %d   Base %d   Space build · J upgrade · Enter wave" % [
		wave,
		TOTAL_WAVES,
		gold,
		maxi(0, base_hp),
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

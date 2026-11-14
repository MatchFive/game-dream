extends Node2D

const ARENA := Rect2(40, 40, 880, 460)
const PLAYER_SPEED := 240.0
const PLAYER_MAX_HP := 180.0
const RUN_SECONDS := 60.0
const BOSS_TIME := 40.0
const MAX_WEAPON_LEVEL := 5
const PLAYER_TEXTURE := preload("res://modules/system.survivor/assets/player.svg")
const CRAWLER_TEXTURE := preload("res://modules/system.survivor/assets/enemy_crawler.svg")
const BRUTE_TEXTURE := preload("res://modules/system.survivor/assets/enemy_brute.svg")
const BOSS_TEXTURE := preload("res://modules/system.survivor/assets/boss.svg")
const GEM_TEXTURE := preload("res://modules/system.survivor/assets/gem.svg")
const SPAWN_POINTS := [
	Vector2(60, 65),
	Vector2(480, 55),
	Vector2(900, 65),
	Vector2(60, 475),
	Vector2(480, 485),
	Vector2(900, 475),
	Vector2(250, 55),
	Vector2(710, 475),
]

var player_pos := Vector2(480, 280)
var player_hp := PLAYER_MAX_HP
var enemies: Array = []
var gems: Array = []
var projectiles: Array = []
var pulses: Array = []
var weapons: Array = [
	{"id": "bolt", "level": 1, "timer": 0.0},
	{"id": "aura", "level": 0, "timer": 0.0},
	{"id": "nova", "level": 0, "timer": 0.0},
]
var player_level := 1
var xp := 0
var next_xp := 6
var kills := 0
var elapsed := 0.0
var spawn_timer := 0.5
var spawn_index := 0
var choosing := false
var choices: Array = []
var boss_spawned := false
var boss_phase := false
var finished := false
var autoplay := false
var level_marker_printed := false
var upgrade_marker_printed := false
var hud: Label
var choice_label: Label

func _ready() -> void:
	_build_hud()
	autoplay = DisplayServer.get_name() == "headless"
	if autoplay:
		Engine.time_scale = 6.0
	for i in range(8):
		_spawn_enemy("crawler")
	print("GAMEDREAM_SURVIVOR_SPAWN")
	queue_redraw()

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 5
	add_child(layer)
	hud = Label.new()
	hud.position = Vector2(20, 20)
	layer.add_child(hud)
	choice_label = Label.new()
	choice_label.position = Vector2(300, 230)
	choice_label.visible = false
	layer.add_child(choice_label)
	_update_hud()

func _process(delta: float) -> void:
	if finished:
		return
	if choosing:
		_update_choice_input()
		return
	if Input.is_action_just_pressed("restart"):
		get_tree().reload_current_scene()
		return
	if autoplay:
		var angle := elapsed * 0.8
		var target := Vector2(480, 280) + Vector2(cos(angle) * 180.0, sin(angle) * 110.0)
		player_pos = player_pos.move_toward(target, PLAYER_SPEED * delta)
	else:
		var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
		player_pos += direction * PLAYER_SPEED * delta
	player_pos.x = clampf(player_pos.x, ARENA.position.x + 22, ARENA.end.x - 22)
	player_pos.y = clampf(player_pos.y, ARENA.position.y + 22, ARENA.end.y - 22)

	elapsed += delta
	if elapsed >= BOSS_TIME and not boss_spawned:
		_spawn_boss()
	_update_spawns(delta)
	_update_weapons(delta)
	_update_projectiles(delta)
	_update_pulses(delta)
	_update_gems(delta)
	_update_enemies(delta)
	_update_hud()
	queue_redraw()

	if elapsed >= RUN_SECONDS:
		_finish(true)
	elif player_hp <= 0.0:
		_finish(false)

func _update_spawns(delta: float) -> void:
	if elapsed >= RUN_SECONDS:
		return
	spawn_timer -= delta
	if spawn_timer > 0.0:
		return
	if elapsed < 20.0:
		spawn_timer = 0.9
	elif elapsed < 35.0:
		spawn_timer = 0.65
	else:
		spawn_timer = 0.48
	if enemies.size() < 42:
		_spawn_enemy(_pick_enemy_type())

func _pick_enemy_type() -> String:
	if elapsed < 17.0:
		return "crawler"
	if elapsed < 30.0:
		return "brute" if spawn_index % 3 == 0 else "crawler"
	return "brute" if spawn_index % 2 == 0 else "crawler"

func _spawn_enemy(type: String) -> void:
	var position: Vector2 = SPAWN_POINTS[spawn_index % SPAWN_POINTS.size()]
	spawn_index += 1
	var hp := 1
	var speed := 55.0
	var radius := 12.0
	var damage := 8.0
	var color := Color(0.95, 0.3, 0.35)
	match type:
		"brute":
			hp = 4
			speed = 36.0
			radius = 16.0
			damage = 12.0
			color = Color(0.8, 0.45, 0.2)
	enemies.append({
		"pos": position,
		"hp": hp,
		"max_hp": hp,
		"speed": speed,
		"radius": radius,
		"damage": damage,
		"type": type,
		"boss": false,
		"color": color,
	})

func _spawn_boss() -> void:
	boss_spawned = true
	enemies.append({
		"pos": Vector2(480, 90),
		"hp": 80,
		"max_hp": 80,
		"speed": 38.0,
		"radius": 28.0,
		"damage": 18.0,
		"type": "boss",
		"boss": true,
		"color": Color(0.7, 0.3, 0.95),
	})
	print("GAMEDREAM_BOSS")

func _update_weapons(delta: float) -> void:
	for weapon in weapons:
		var weapon_id: String = weapon["id"]
		var weapon_level: int = weapon["level"]
		if weapon_level <= 0:
			continue
		weapon["timer"] = float(weapon["timer"]) - delta
		if float(weapon["timer"]) > 0.0:
			continue
		match weapon_id:
			"bolt":
				_fire_bolt(weapon_level)
				weapon["timer"] = maxf(0.16, 0.38 - weapon_level * 0.03)
			"aura":
				_pulse(70.0 + weapon_level * 9.0, 1 + weapon_level, Color(0.3, 0.9, 0.8))
				weapon["timer"] = maxf(0.45, 1.0 - weapon_level * 0.08)
			"nova":
				_pulse(140.0 + weapon_level * 16.0, 2 + weapon_level, Color(0.9, 0.7, 0.25))
				weapon["timer"] = maxf(1.3, 2.3 - weapon_level * 0.15)

func _fire_bolt(weapon_level: int) -> void:
	var index := _nearest_enemy_index()
	if index < 0:
		return
	var target_pos: Vector2 = enemies[index]["pos"]
	var direction := (target_pos - player_pos).normalized()
	if direction == Vector2.ZERO:
		direction = Vector2.RIGHT
	projectiles.append({
		"pos": player_pos,
		"velocity": direction * 720.0,
		"damage": 2 + weapon_level,
		"color": Color(1.0, 0.86, 0.3),
	})

func _pulse(radius: float, damage: int, color: Color) -> void:
	pulses.append({"pos": player_pos, "radius": radius, "timer": 0.22, "color": color})
	for i in range(enemies.size() - 1, -1, -1):
		var enemy_pos: Vector2 = enemies[i]["pos"]
		var enemy_radius: float = enemies[i]["radius"]
		if player_pos.distance_to(enemy_pos) <= radius + enemy_radius:
			_damage_enemy(i, damage)

func _update_projectiles(delta: float) -> void:
	for i in range(projectiles.size() - 1, -1, -1):
		var projectile: Dictionary = projectiles[i]
		var position: Vector2 = projectile["pos"]
		position += projectile["velocity"] * delta
		projectile["pos"] = position
		if not ARENA.has_point(position):
			projectiles.remove_at(i)
			continue
		var hit := false
		for j in range(enemies.size() - 1, -1, -1):
			var enemy: Dictionary = enemies[j]
			var enemy_pos: Vector2 = enemy["pos"]
			var radius: float = enemy["radius"]
			if position.distance_to(enemy_pos) <= radius + 5.0:
				_damage_enemy(j, int(projectile["damage"]))
				projectiles.remove_at(i)
				hit = true
				break
		if hit:
			continue

func _update_pulses(delta: float) -> void:
	for i in range(pulses.size() - 1, -1, -1):
		pulses[i]["timer"] = float(pulses[i]["timer"]) - delta
		if float(pulses[i]["timer"]) <= 0.0:
			pulses.remove_at(i)

func _damage_enemy(index: int, amount: int) -> void:
	if index < 0 or index >= enemies.size():
		return
	var enemy: Dictionary = enemies[index]
	if bool(enemy["boss"]):
		enemy["hp"] = int(enemy["hp"]) - amount
		if not boss_phase and int(enemy["hp"]) <= int(enemy["max_hp"]) / 2:
			boss_phase = true
			enemy["speed"] = float(enemy["speed"]) + 18.0
			enemy["damage"] = float(enemy["damage"]) + 8.0
			print("GAMEDREAM_BOSS_PHASE")
		if int(enemy["hp"]) > 0:
			return
	else:
		enemy["hp"] = int(enemy["hp"]) - amount
		if int(enemy["hp"]) > 0:
			return
	var death_pos: Vector2 = enemy["pos"]
	var boss := bool(enemy["boss"])
	enemies.remove_at(index)
	kills += 1
	gems.append({"pos": death_pos, "value": 5 if boss else 1})
	queue_redraw()

func _update_gems(delta: float) -> void:
	for i in range(gems.size() - 1, -1, -1):
		var gem: Dictionary = gems[i]
		var position: Vector2 = gem["pos"]
		var offset := player_pos - position
		if offset.length() < 150.0:
			gem["pos"] = position + offset.normalized() * 260.0 * delta
		if player_pos.distance_to(gem["pos"]) < 28.0:
			var value: int = gem["value"]
			gems.remove_at(i)
			_gain_xp(value)

func _gain_xp(amount: int) -> void:
	xp += amount
	while xp >= next_xp:
		xp -= next_xp
		player_level += 1
		next_xp = 6 + player_level * 3
		if not level_marker_printed:
			print("GAMEDREAM_SURVIVOR_LEVEL")
			level_marker_printed = true
		_open_choices()
		if choosing and autoplay:
			_choose(0)

func _open_choices() -> void:
	if choosing:
		return
	choices = []
	for weapon in weapons:
		var weapon_level: int = weapon["level"]
		if weapon_level < MAX_WEAPON_LEVEL:
			choices.append({"type": "weapon", "id": weapon["id"], "level": weapon_level})
	if choices.size() < 3 and player_hp < PLAYER_MAX_HP:
		choices.append({"type": "heal"})
	if choices.is_empty():
		choices.append({"type": "heal"})
	choices = choices.slice(0, 3)
	choosing = true
	choice_label.visible = true
	choice_label.text = _choice_text()
	_update_hud()
	queue_redraw()
	if autoplay:
		_choose(0)

func _choice_text() -> String:
	var lines: Array = ["LEVEL UP — choose an upgrade", ""]
	for i in range(choices.size()):
		var choice: Dictionary = choices[i]
		if choice["type"] == "heal":
			lines.append("%d. Restore HP" % (i + 1))
		else:
			var weapon_id: String = choice["id"]
			var weapon_level: int = choice["level"]
			lines.append("%d. %s  Lv %d -> %d" % [i + 1, weapon_id.capitalize(), weapon_level + 1, weapon_level + 2])
	return "\n".join(lines)

func _update_choice_input() -> void:
	if autoplay:
		_choose(0)
		return
	for i in range(3):
		if Input.is_action_just_pressed("upgrade_%d" % (i + 1)):
			_choose(i)
			return

func _choose(index: int) -> void:
	if not choosing or index < 0 or index >= choices.size():
		return
	var choice: Dictionary = choices[index]
	if choice["type"] == "heal":
		player_hp = minf(PLAYER_MAX_HP, player_hp + 45.0)
	else:
		var weapon_id: String = choice["id"]
		for weapon in weapons:
			if weapon["id"] == weapon_id:
				weapon["level"] = int(weapon["level"]) + 1
				break
	choosing = false
	choice_label.visible = false
	if not upgrade_marker_printed:
		print("GAMEDREAM_UPGRADE")
		upgrade_marker_printed = true
	_update_hud()
	queue_redraw()
	if xp >= next_xp:
		_gain_xp(0)

func _nearest_enemy_index() -> int:
	var best := -1
	var best_distance := INF
	for i in range(enemies.size()):
		var position: Vector2 = enemies[i]["pos"]
		var distance := player_pos.distance_squared_to(position)
		if distance < best_distance:
			best = i
			best_distance = distance
	return best

func _update_enemies(delta: float) -> void:
	for enemy in enemies:
		var position: Vector2 = enemy["pos"]
		var offset: Vector2 = player_pos - position
		var distance := offset.length()
		if distance > 24.0 + float(enemy["radius"]):
			enemy["pos"] = position + offset.normalized() * float(enemy["speed"]) * delta
		else:
			player_hp -= float(enemy["damage"]) * delta

func _update_hud() -> void:
	if hud == null:
		return
	var weapon_text := ""
	for weapon in weapons:
		if int(weapon["level"]) > 0:
			weapon_text += " %s%d" % [String(weapon["id"]), int(weapon["level"])]
	hud.text = "Time %.1f/%.0f   Lv %d   HP %d/%d   XP %d/%d   Kills %d%s" % [
		minf(elapsed, RUN_SECONDS),
		RUN_SECONDS,
		player_level,
		maxi(0, int(player_hp)),
		int(PLAYER_MAX_HP),
		xp,
		next_xp,
		kills,
		weapon_text,
	]

func _draw() -> void:
	draw_rect(Rect2(Vector2(-100, -100), Vector2(1200, 800)), Color(0.04, 0.05, 0.08))
	draw_rect(ARENA, Color(0.08, 0.1, 0.15))
	draw_rect(ARENA, Color(0.2, 0.28, 0.4), false, 3.0)

	draw_rect(Rect2(20, 48, 280, 10), Color(0.15, 0.18, 0.24))
	draw_rect(
		Rect2(20, 48, 280.0 * clampf(player_hp / PLAYER_MAX_HP, 0.0, 1.0), 10),
		Color(0.35, 0.85, 0.5),
	)
	draw_rect(Rect2(20, 64, 280, 8), Color(0.15, 0.18, 0.24))
	var xp_ratio := clampf(float(xp) / float(next_xp), 0.0, 1.0)
	draw_rect(Rect2(20, 64, 280.0 * xp_ratio, 8), Color(0.4, 0.65, 1.0))

	for gem in gems:
		var position: Vector2 = gem["pos"]
		draw_texture_rect(GEM_TEXTURE, Rect2(position - Vector2(10, 10), Vector2(20, 20)), false)

	for enemy in enemies:
		var position: Vector2 = enemy["pos"]
		var radius: float = enemy["radius"]
		var texture: Texture2D = CRAWLER_TEXTURE
		if bool(enemy["boss"]):
			texture = BOSS_TEXTURE
		elif String(enemy["type"]) == "brute":
			texture = BRUTE_TEXTURE
		draw_texture_rect(
			texture,
			Rect2(position - Vector2(radius * 1.35, radius * 1.35), Vector2(radius * 2.7, radius * 2.7)),
			false,
		)
		if bool(enemy["boss"]):
			draw_arc(position, radius + 8.0, 0.0, TAU, 32, Color(1.0, 0.4, 0.9), 3.0)

	for projectile in projectiles:
		draw_circle(projectile["pos"], 5.0, projectile["color"])

	for pulse in pulses:
		var progress := 1.0 - float(pulse["timer"]) / 0.22
		draw_arc(pulse["pos"], float(pulse["radius"]) * progress, 0.0, TAU, 40, pulse["color"], 3.0)

	draw_texture_rect(
		PLAYER_TEXTURE,
		Rect2(player_pos - Vector2(22, 22), Vector2(44, 44)),
		false,
	)

	if choosing:
		draw_rect(Rect2(240, 150, 500, 250), Color(0.03, 0.04, 0.07, 0.92))
		draw_rect(Rect2(240, 150, 500, 250), Color(0.4, 0.65, 1.0), false, 2.0)

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

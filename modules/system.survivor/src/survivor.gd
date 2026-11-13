extends Node2D

const ARENA := Rect2(40, 40, 880, 460)
const PLAYER_SPEED := 250.0
const ENEMY_SPEED := 55.0
const SPAWN_INTERVAL := 0.5
const ATTACK_INTERVAL := 0.22
const SURVIVAL_SECONDS := 12.0
const SPAWN_POINTS := [
	Vector2(80, 80),
	Vector2(480, 65),
	Vector2(880, 80),
	Vector2(80, 460),
	Vector2(480, 475),
	Vector2(880, 460),
]

var player_pos := Vector2(480, 280)
var player_hp := 100.0
var enemies: Array = []
var player_level := 1
var xp := 0
var next_xp := 4
var attack_damage := 1
var kills := 0
var elapsed := 0.0
var spawn_timer := 0.4
var attack_timer := 0.0
var spawn_index := 0
var attack_flash := 0.0
var last_target := Vector2.ZERO
var finished := false
var autoplay := false
var leveled_once := false
var hud: Label

func _ready() -> void:
	_build_hud()
	autoplay = DisplayServer.get_name() == "headless"
	for i in range(12):
		_spawn_enemy()
	print("GAMEDREAM_SURVIVOR_SPAWN")
	queue_redraw()

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 5
	add_child(layer)
	hud = Label.new()
	hud.position = Vector2(20, 20)
	layer.add_child(hud)
	_update_hud()

func _spawn_enemy() -> void:
	var position: Vector2 = SPAWN_POINTS[spawn_index % SPAWN_POINTS.size()]
	spawn_index += 1
	enemies.append({"pos": position, "hp": 1})

func _process(delta: float) -> void:
	if finished:
		return
	if Input.is_action_just_pressed("restart"):
		get_tree().reload_current_scene()
		return
	if not autoplay:
		var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
		player_pos += direction * PLAYER_SPEED * delta
		player_pos.x = clampf(player_pos.x, ARENA.position.x + 22, ARENA.end.x - 22)
		player_pos.y = clampf(player_pos.y, ARENA.position.y + 22, ARENA.end.y - 22)

	elapsed += delta
	spawn_timer -= delta
	if spawn_timer <= 0.0:
		spawn_timer = SPAWN_INTERVAL
		_spawn_enemy()

	attack_timer -= delta
	if attack_timer <= 0.0:
		attack_timer = ATTACK_INTERVAL
		_auto_attack()

	_update_enemies(delta)
	attack_flash = maxf(0.0, attack_flash - delta)
	_update_hud()
	queue_redraw()

	if elapsed >= SURVIVAL_SECONDS:
		_finish(true)
	elif player_hp <= 0.0:
		_finish(false)

func _auto_attack() -> void:
	var index := _nearest_enemy_index()
	if index < 0:
		return
	var target: Dictionary = enemies[index]
	last_target = target["pos"]
	attack_flash = 0.09
	target["hp"] = int(target["hp"]) - attack_damage
	if int(target["hp"]) <= 0:
		enemies.remove_at(index)
		kills += 1
		_add_xp()

func _add_xp() -> void:
	xp += 1
	if xp < next_xp:
		return
	xp -= next_xp
	player_level += 1
	next_xp = 4 + player_level * 2
	attack_damage += 1
	if not leveled_once:
		print("GAMEDREAM_SURVIVOR_LEVEL")
		leveled_once = true

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
		if distance > 24.0:
			enemy["pos"] = position + offset.normalized() * ENEMY_SPEED * delta
		else:
			player_hp -= 8.0 * delta

func _draw() -> void:
	draw_rect(Rect2(Vector2(-100, -100), Vector2(1200, 800)), Color(0.04, 0.05, 0.08))
	draw_rect(ARENA, Color(0.08, 0.1, 0.15))
	draw_rect(ARENA, Color(0.2, 0.28, 0.4), false, 3.0)

	for enemy in enemies:
		var position: Vector2 = enemy["pos"]
		draw_circle(position, 13.0, Color(0.95, 0.3, 0.35))
		draw_circle(position, 5.0, Color(0.35, 0.1, 0.13))

	if attack_flash > 0.0:
		draw_line(player_pos, last_target, Color(1.0, 0.85, 0.3), 3.0)

	draw_circle(player_pos, 18.0, Color(0.25, 0.7, 1.0))
	draw_circle(player_pos, 7.0, Color(0.8, 0.95, 1.0))

func _update_hud() -> void:
	if hud == null:
		return
	hud.text = "Time %.1f/%.0f   Lv %d   XP %d/%d   HP %d   Kills %d" % [
		minf(elapsed, SURVIVAL_SECONDS),
		SURVIVAL_SECONDS,
		player_level,
		xp,
		next_xp,
		maxi(0, int(player_hp)),
		kills,
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

extends Node2D

const GROUND_Y := 500.0
const PLAYER_SPEED := 240.0
const GRAVITY := 900.0
const JUMP_SPEED := -380.0
const STAGE_COUNT := 3
const STAGE_NAMES := ["Rooftops", "Foundry", "Skyline"]
const STAGE_GOALS := [Vector2(1450, 460), Vector2(2700, 460), Vector2(3950, 460)]
const COIN_POSITIONS := [
	Vector2(380, 470), Vector2(740, 470), Vector2(1100, 470),
	Vector2(1650, 470), Vector2(2050, 470), Vector2(2450, 470),
	Vector2(2950, 470), Vector2(3350, 470), Vector2(3750, 470),
]

var player: CharacterBody2D
var camera: Camera2D
var hud: Label
var coins := 0
var stage_index := 0
var finished := false
var autoplay := false
var _last_auto_jump := 0

func _ready() -> void:
	_build_level()
	autoplay = DisplayServer.get_name() == "headless"
	if autoplay:
		Input.action_press("move_right")
		_last_auto_jump = Time.get_ticks_msec()

func _build_level() -> void:
	var background := Polygon2D.new()
	background.color = Color(0.07, 0.09, 0.13)
	background.polygon = PackedVector2Array(
		[Vector2(-400, -300), Vector2(4800, -300), Vector2(4800, 800), Vector2(-400, 800)]
	)
	background.z_index = -10
	add_child(background)
	_make_static(Vector2(2400, GROUND_Y + 20), Vector2(4800, 40))
	_make_static(Vector2(650, 420), Vector2(180, 20))
	_make_static(Vector2(980, 360), Vector2(160, 20))
	_make_static(Vector2(1260, 300), Vector2(180, 20))
	_make_static(Vector2(1900, 420), Vector2(180, 20))
	_make_static(Vector2(2250, 360), Vector2(160, 20))
	_make_static(Vector2(3150, 420), Vector2(180, 20))
	_make_static(Vector2(3500, 360), Vector2(160, 20))

	player = CharacterBody2D.new()
	player.position = Vector2(100, GROUND_Y - 24)
	player.collision_layer = 1
	player.collision_mask = 1
	var player_shape := CollisionShape2D.new()
	var player_rect := RectangleShape2D.new()
	player_rect.size = Vector2(24, 32)
	player_shape.shape = player_rect
	player.add_child(player_shape)
	var body := Polygon2D.new()
	body.color = Color(0.25, 0.7, 1.0)
	body.polygon = PackedVector2Array(
		[Vector2(-12, -16), Vector2(12, -16), Vector2(12, 16), Vector2(-12, 16)]
	)
	player.add_child(body)
	add_child(player)

	camera = Camera2D.new()
	camera.position = Vector2.ZERO
	player.add_child(camera)

	for position in COIN_POSITIONS:
		_make_coin(position)
	for index in range(STAGE_GOALS.size()):
		_make_goal(STAGE_GOALS[index], index)

	var layer := CanvasLayer.new()
	layer.layer = 5
	add_child(layer)
	hud = Label.new()
	hud.position = Vector2(20, 20)
	_update_hud()
	layer.add_child(hud)

func _update_hud() -> void:
	if hud == null:
		return
	hud.text = "Stage %d/%d %s   Coins %d/%d   A/D move · Space jump · R restart" % [
		stage_index + 1,
		STAGE_COUNT,
		STAGE_NAMES[stage_index],
		coins,
		COIN_POSITIONS.size(),
	]

func _make_static(position: Vector2, size: Vector2) -> void:
	var body := StaticBody2D.new()
	body.position = position
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = size
	shape.shape = rect
	body.add_child(shape)
	var visual := Polygon2D.new()
	visual.color = Color(0.35, 0.3, 0.45)
	var half := size / 2.0
	visual.polygon = PackedVector2Array(
		[
			Vector2(-half.x, -half.y),
			Vector2(half.x, -half.y),
			Vector2(half.x, half.y),
			Vector2(-half.x, half.y),
		]
	)
	body.add_child(visual)
	add_child(body)

func _make_coin(position: Vector2) -> void:
	var coin := Area2D.new()
	coin.position = position
	coin.collision_layer = 2
	coin.collision_mask = 1
	var shape := CollisionShape2D.new()
	var circle := CircleShape2D.new()
	circle.radius = 14
	shape.shape = circle
	coin.add_child(shape)
	var visual := Polygon2D.new()
	visual.color = Color(1.0, 0.78, 0.2)
	visual.polygon = PackedVector2Array([Vector2(0, -12), Vector2(12, 0), Vector2(0, 12), Vector2(-12, 0)])
	coin.add_child(visual)
	coin.body_entered.connect(_on_coin_entered.bind(coin))
	add_child(coin)

func _make_goal(position: Vector2, index: int) -> void:
	var goal := Area2D.new()
	goal.position = position
	goal.collision_layer = 2
	goal.collision_mask = 1
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(44, 80)
	shape.shape = rect
	goal.add_child(shape)
	var visual := Polygon2D.new()
	visual.color = Color(0.3, 0.9, 0.45)
	visual.polygon = PackedVector2Array(
		[Vector2(-22, -40), Vector2(22, -40), Vector2(22, 40), Vector2(-22, 40)]
	)
	goal.add_child(visual)
	goal.body_entered.connect(_on_goal_entered.bind(index))
	add_child(goal)

func _physics_process(delta: float) -> void:
	if finished or player == null:
		return
	if Input.is_action_just_pressed("restart"):
		get_tree().reload_current_scene()
		return

	var direction := 0.0
	if autoplay:
		direction = 1.0
	else:
		direction = Input.get_axis("move_left", "move_right")
	player.velocity.x = direction * PLAYER_SPEED
	if not player.is_on_floor():
		player.velocity.y += GRAVITY * delta

	var jump := Input.is_action_just_pressed("jump")
	if autoplay and player.global_position.x < 1200.0:
		var now := Time.get_ticks_msec()
		if player.is_on_floor() and now - _last_auto_jump > 900:
			jump = true
			_last_auto_jump = now
	if jump and player.is_on_floor():
		player.velocity.y = JUMP_SPEED

	player.move_and_slide()
	if player.global_position.y > GROUND_Y + 120.0:
		_finish(false)

func _on_coin_entered(body: Node2D, coin: Area2D) -> void:
	if body != player or finished:
		return
	coin.queue_free()
	coins += 1
	if coins == 1:
		print("GAMEDREAM_COIN")
	_update_hud()

func _on_goal_entered(body: Node2D, index: int) -> void:
	if body != player or finished or index != stage_index:
		return
	if stage_index + 1 >= STAGE_COUNT:
		_finish(true)
		return
	stage_index += 1
	print("GAMEDREAM_STAGE=%d" % (stage_index + 1))
	_update_hud()

func _finish(won: bool) -> void:
	if finished:
		return
	finished = true
	if autoplay:
		Input.action_release("move_right")
	if won:
		print("GAMEDREAM_WIN")
	else:
		print("GAMEDREAM_LOSE")
	await get_tree().process_frame
	get_tree().quit(0 if won else 1)

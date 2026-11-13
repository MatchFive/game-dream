extends Node

func _ready() -> void:
	Game.register_service("maps", self)

func build(parent: Node, data: Dictionary) -> bool:
	if parent == null or data.is_empty():
		return false
	if parent.has_node("Ground"):
		push_warning("map: parent already has a Ground layer")
		return false
	var rows_value = data.get("rows", [])
	if not rows_value is Array or rows_value.is_empty():
		return false
	var rows: Array = rows_value
	var expected_width := -1
	var tile_count := 0
	for row_value in rows:
		var row := str(row_value)
		if row.length() > 0 and expected_width == -1:
			expected_width = row.length()
		elif row.length() != expected_width:
			push_warning("map: ragged rows (%d vs %d)" % [row.length(), expected_width])
		for x in range(row.length()):
			var ch := row.substr(x, 1)
			if ch == "#" or ch == ".":
				tile_count += 1
	if tile_count == 0:
		push_warning("map: no tiles in rows")
		return false
	var tile_size := maxi(1, int(data.get("tile_size", 32)))
	var colors_value = data.get("tileset", {})
	var colors: Dictionary = colors_value if colors_value is Dictionary else {}
	var floor_color := Color.from_string(str(colors.get("floor", "2f5d3a")), Color(0.18, 0.36, 0.23))
	var wall_color := Color.from_string(str(colors.get("wall", "1b3324")), Color(0.11, 0.20, 0.14))
	var image := Image.create(tile_size * 2, tile_size, false, Image.FORMAT_RGBA8)
	image.fill_rect(Rect2i(0, 0, tile_size, tile_size), floor_color)
	image.fill_rect(Rect2i(tile_size, 0, tile_size, tile_size), wall_color)
	var texture := ImageTexture.create_from_image(image)
	var tileset := TileSet.new()
	tileset.tile_size = Vector2i(tile_size, tile_size)
	var source := TileSetAtlasSource.new()
	source.texture = texture
	source.texture_region_size = Vector2i(tile_size, tile_size)
	source.create_tile(Vector2i(0, 0))
	source.create_tile(Vector2i(1, 0))
	tileset.add_source(source, 0)
	var layer := TileMapLayer.new()
	layer.name = "Ground"
	layer.tile_set = tileset
	parent.add_child(layer)
	var walls := StaticBody2D.new()
	walls.name = "Walls"
	parent.add_child(walls)
	for y in range(rows.size()):
		var row := str(rows[y])
		for x in range(row.length()):
			var ch := row.substr(x, 1)
			var tile := Vector2i(1, 0) if ch == "#" else Vector2i(0, 0)
			layer.set_cell(Vector2i(x, y), 0, tile)
			if ch == "#":
				var shape := CollisionShape2D.new()
				var rect := RectangleShape2D.new()
				rect.size = Vector2(tile_size, tile_size)
				shape.shape = rect
				shape.position = Vector2(x * tile_size + tile_size / 2.0, y * tile_size + tile_size / 2.0)
				walls.add_child(shape)
	return true

func is_wall(data: Dictionary, world_pos: Vector2) -> bool:
	var rows_value = data.get("rows", [])
	if not rows_value is Array:
		return true
	var rows: Array = rows_value
	var tile_size := maxi(1, int(data.get("tile_size", 32)))
	var x := int(floor(world_pos.x / tile_size))
	var y := int(floor(world_pos.y / tile_size))
	if y < 0 or y >= rows.size():
		return true
	var row := str(rows[y])
	if x < 0 or x >= row.length():
		return true
	return row.substr(x, 1) == "#"

func first_floor(data: Dictionary) -> Vector2:
	var rows_value = data.get("rows", [])
	var rows: Array = rows_value if rows_value is Array else []
	var tile_size := maxi(1, int(data.get("tile_size", 32)))
	for y in range(rows.size()):
		var row := str(rows[y])
		for x in range(row.length()):
			if row.substr(x, 1) == ".":
				return Vector2(x * tile_size + tile_size / 2.0, y * tile_size + tile_size / 2.0)
	return Vector2(tile_size * 1.5, tile_size * 1.5)

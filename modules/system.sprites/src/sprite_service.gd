extends Node

var applied_count: int = 0
var applied: Dictionary = {}

func _ready() -> void:
	Game.register_service("sprites", self)

func apply(sprite: AnimatedSprite2D, sprite_id: String) -> bool:
	if sprite == null:
		return false
	var content = Game.get_service("content")
	if content == null:
		return false
	var data: Dictionary = content.get_sprite(sprite_id)
	if data.is_empty():
		push_warning("sprites: missing config '%s'" % sprite_id)
		return false
	var texture_path := str(data.get("texture", ""))
	if texture_path == "" or not ResourceLoader.exists(texture_path):
		push_warning("sprites: missing texture for '%s'" % sprite_id)
		return false
	var texture = load(texture_path)
	if not texture is Texture2D:
		push_warning("sprites: texture is not Texture2D for '%s'" % sprite_id)
		return false
	var frame_value = data.get("frame_size", [32, 32])
	if not frame_value is Array or frame_value.size() < 2:
		push_warning("sprites: bad frame_size for '%s'" % sprite_id)
		return false
	var frame_width := int(frame_value[0])
	var frame_height := int(frame_value[1])
	if frame_width <= 0 or frame_height <= 0:
		push_warning("sprites: bad frame_size for '%s'" % sprite_id)
		return false
	var animations_value = data.get("animations", {})
	if not animations_value is Dictionary:
		push_warning("sprites: bad animations for '%s'" % sprite_id)
		return false
	var animations: Dictionary = animations_value
	if animations.is_empty():
		push_warning("sprites: empty animations for '%s'" % sprite_id)
		return false
	var frames := SpriteFrames.new()
	var texture_size: Vector2 = texture.get_size()
	var built: Array = []
	for animation_name in animations.keys():
		var animation_value = animations[animation_name]
		if not animation_value is Dictionary:
			continue
		var animation: Dictionary = animation_value
		var frame_list = animation.get("frames", [])
		if not frame_list is Array or frame_list.is_empty():
			continue
		var name := str(animation_name)
		if frames.has_animation(name):
			frames.remove_animation(name)
		frames.add_animation(name)
		frames.set_animation_speed(name, float(animation.get("fps", 8.0)))
		var loop := bool(animation.get("loop", true))
		if name == "attack":
			loop = false
		frames.set_animation_loop(name, loop)
		for frame_value_index in frame_list:
			var index := int(frame_value_index)
			if index < 0 or index * frame_width + frame_width > texture_size.x or frame_height > texture_size.y:
				push_warning("sprites: frame out of bounds for '%s'" % sprite_id)
				return false
			var atlas := AtlasTexture.new()
			atlas.atlas = texture
			atlas.region = Rect2(index * frame_width, 0, frame_width, frame_height)
			frames.add_frame(name, atlas)
		if frames.get_frame_count(name) > 0:
			built.append(name)
		else:
			frames.remove_animation(name)
	if built.is_empty():
		push_warning("sprites: no built frames for '%s'" % sprite_id)
		return false
	sprite.sprite_frames = frames
	var start := "idle" if built.has("idle") else str(built[0])
	sprite.animation = start
	sprite.play()
	sprite.visible = true
	applied[sprite_id] = true
	applied_count += 1
	return true

func has_applied(sprite_id: String) -> bool:
	return applied.has(sprite_id)

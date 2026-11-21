extends Node

const GENERATED_ANIMATIONS := "res://game/build-assets/animations"

var applied_count: int = 0
var applied: Dictionary = {}
var generated_applied := false
var generated_loaded := false
var generated_frames: SpriteFrames = null

func _ready() -> void:
	Game.register_service("sprites", self)

func apply(sprite: AnimatedSprite2D, sprite_id: String) -> bool:
	if sprite == null:
		return false
	if _has_generated_frames():
		return _apply_generated(sprite, sprite_id)
	var content = Game.get_service("content")
	var data: Dictionary = {}
	if content != null:
		data = content.get_sprite(sprite_id)
	if data.is_empty():
		return _apply_generated(sprite, sprite_id)
	var texture_path := str(data.get("texture", ""))
	if texture_path == "" or not ResourceLoader.exists(texture_path):
		return _apply_generated(sprite, sprite_id)
	var texture = load(texture_path)
	if not texture is Texture2D:
		return _apply_generated(sprite, sprite_id)
	var frame_value = data.get("frame_size", [32, 32])
	if not frame_value is Array or frame_value.size() < 2:
		push_warning("sprites: bad frame_size for '%s'" % sprite_id)
		return _apply_generated(sprite, sprite_id)
	var frame_width := int(frame_value[0])
	var frame_height := int(frame_value[1])
	if frame_width <= 0 or frame_height <= 0:
		push_warning("sprites: bad frame_size for '%s'" % sprite_id)
		return _apply_generated(sprite, sprite_id)
	var animations_value = data.get("animations", {})
	if not animations_value is Dictionary:
		push_warning("sprites: bad animations for '%s'" % sprite_id)
		return _apply_generated(sprite, sprite_id)
	var animations: Dictionary = animations_value
	if animations.is_empty():
		push_warning("sprites: empty animations for '%s'" % sprite_id)
		return _apply_generated(sprite, sprite_id)
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
				return _apply_generated(sprite, sprite_id)
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
		return _apply_generated(sprite, sprite_id)
	return _apply_frames(sprite, frames, built, sprite_id)

func _has_generated_frames() -> bool:
	if generated_loaded:
		return generated_frames != null
	generated_loaded = true
	var directory := DirAccess.open(GENERATED_ANIMATIONS)
	if directory == null:
		return false
	var files := directory.get_files()
	files.sort()
	for file_name in files:
		var name := str(file_name)
		if not name.ends_with(".tres"):
			continue
		var path := "%s/%s" % [GENERATED_ANIMATIONS, name]
		var resource = load(path)
		if resource is SpriteFrames and resource.get_animation_names().size() > 0:
			generated_frames = resource
			return true
	return false

func _apply_generated(sprite: AnimatedSprite2D, sprite_id: String) -> bool:
	if generated_frames == null:
		return false
	var names: Array = generated_frames.get_animation_names()
	var start := "idle" if generated_frames.has_animation("idle") else str(names[0])
	if not generated_applied:
		generated_applied = true
		print("GAMEDREAM_ANIMATION_OK")
	return _apply_frames(sprite, generated_frames, [start], sprite_id)

func _apply_frames(
	sprite: AnimatedSprite2D,
	frames: SpriteFrames,
	built: Array,
	sprite_id: String,
) -> bool:
	sprite.sprite_frames = frames
	var start := "idle" if built.has("idle") else str(built[0])
	if not frames.has_animation(start):
		start = str(frames.get_animation_names()[0])
	sprite.animation = start
	sprite.play()
	sprite.visible = true
	applied[sprite_id] = true
	applied_count += 1
	return true

func has_applied(sprite_id: String) -> bool:
	return applied.has(sprite_id)

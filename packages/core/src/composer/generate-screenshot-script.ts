export function generateScreenshotScript(): string {
  return `extends Node

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	if not args.has("--screenshot"):
		return
	_capture()

func _capture() -> void:
	for _i in range(5):
		await get_tree().process_frame
	var menu = get_tree().get_first_node_in_group("main_menu")
	if menu:
		menu.visible = false
	get_tree().paused = false
	if Game.events:
		Game.events.emit_event("game.started", {"new_game": true})
	for _i in range(60):
		await get_tree().process_frame
	var image: Image = get_viewport().get_texture().get_image()
	if image == null:
		print("GAMEDREAM_SCREENSHOT_FAILED=no image")
		get_tree().quit(1)
		return
	var width := image.get_width()
	var height := image.get_height()
	var samples := 0
	var non_black := 0
	var colors := {}
	for y in range(0, height, 8):
		for x in range(0, width, 8):
			samples += 1
			var color := image.get_pixel(x, y)
			if color.r + color.g + color.b > 0.05:
				non_black += 1
			colors[color.to_html()] = true
	var path := "user://screenshot.png"
	var error := image.save_png(path)
	if error != OK:
		print("GAMEDREAM_SCREENSHOT_FAILED=save")
		get_tree().quit(1)
		return
	print("GAMEDREAM_SCREENSHOT_PATH=" + ProjectSettings.globalize_path(path))
	print("GAMEDREAM_SCREENSHOT_METRICS=" + JSON.stringify({
		"width": width,
		"height": height,
		"samples": samples,
		"non_black": non_black,
		"colors": colors.size(),
	}))
	print("GAMEDREAM_SCREENSHOT_OK")
	get_tree().quit(0)
`;
}

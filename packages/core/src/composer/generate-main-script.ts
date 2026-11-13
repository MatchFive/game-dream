import type { ModuleRecord } from '../registry/types.js';

export function generateMainScript(modules: ModuleRecord[]): string {
  const hasGameScene = modules.some((module) => module.manifest.main_scene);
  return `extends Node

const HAS_GAME_SCENE = ${hasGameScene ? 'true' : 'false'}

func _ready() -> void:
	print("GAMEDREAM_BOOT_OK")
	await get_tree().create_timer(0.1).timeout
	if Game.has_service("inventory"):
		var inventory := Game.get_service("inventory")
		inventory.add_item("potion", 1)
		print("INVENTORY_COUNT=%d" % inventory.count("potion"))
	if not HAS_GAME_SCENE:
		await get_tree().create_timer(0.2).timeout
		get_tree().quit(0)
`;
}

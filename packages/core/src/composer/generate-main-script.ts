import type { ModuleRecord } from '../registry/types.js';

export function generateMainScript(modules: ModuleRecord[]): string {
  const hasGameScene = modules.some((module) => module.manifest.main_scene);
  const actions = [
    ...new Set(
      modules.flatMap((module) =>
        module.manifest.input_actions.map((action) => action.name),
      ),
    ),
  ];
  const actionList = actions.map((action) => `"${action}"`).join(', ');

  return `extends Node

const HAS_GAME_SCENE = ${hasGameScene ? 'true' : 'false'}
const REQUIRED_ACTIONS = [${actionList}]

func _ready() -> void:
	for action in REQUIRED_ACTIONS:
		if not InputMap.has_action(action):
			push_error("missing input action: " + action)
			get_tree().quit(1)
			return
	print("GAMEDREAM_BOOT_OK")
	await get_tree().create_timer(0.1).timeout
	if Game.has_service("inventory"):
		var inventory := Game.get_service("inventory")
		inventory.add_item("potion", 1)
		print("INVENTORY_COUNT=%d" % inventory.count("potion"))
	if not HAS_GAME_SCENE:
		await get_tree().create_timer(0.2).timeout
		if not OS.get_cmdline_user_args().has("--screenshot"):
			get_tree().quit(0)
`;
}

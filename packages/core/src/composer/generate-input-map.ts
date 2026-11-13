import type { ModuleRecord } from '../registry/types.js';

export function generateInputMap(modules: ModuleRecord[]): string {
  const actions = modules.flatMap((module) => module.manifest.input_actions);
  const lines = ['extends Node', '', 'func _ready() -> void:'];
  if (actions.length === 0) {
    lines.push('\tpass');
  }
  for (const action of actions) {
    const keys = action.keys.map((key) => `KEY_${key.toUpperCase()}`).join(', ');
    lines.push(`\t_add("${action.name}", [${keys}])`);
  }
  lines.push(
    '',
    'func _add(action: String, keys: Array) -> void:',
    '\tif InputMap.has_action(action):',
    '\t\tInputMap.erase_action(action)',
    '\tInputMap.add_action(action)',
    '\tfor key in keys:',
    '\t\tvar event := InputEventKey.new()',
    '\t\tevent.physical_keycode = key',
    '\t\tInputMap.action_add_event(action, event)',
  );
  return `${lines.join('\n')}\n`;
}

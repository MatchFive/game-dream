import type { ModuleRecord } from '../registry/types.js';

export function generateProjectGodot(input: {
  projectName: string;
  modules: ModuleRecord[];
}): string {
  const autoloads = input.modules
    .flatMap((module) =>
      module.manifest.autoloads.map((autoload) => ({
        ...autoload,
        moduleId: module.manifest.id,
      })),
    )
    .sort((a, b) => a.order - b.order || a.moduleId.localeCompare(b.moduleId));

  const hasInputActions = input.modules.some(
    (module) => module.manifest.input_actions.length > 0,
  );

  const lines = [
    '; Engine configuration file.',
    'config_version=5',
    '',
    '[application]',
    `config/name="${input.projectName}"`,
    'run/main_scene="res://game/_generated/main.tscn"',
    'config/features=PackedStringArray("4.4", "GL Compatibility")',
    '',
    '[autoload]',
    'Game="*res://game/_generated/game.gd"',
    ...(hasInputActions
      ? ['InputMapSetup="*res://game/_generated/input_map.gd"']
      : []),
    ...autoloads.map(
      (autoload) =>
        `${autoload.name}="*res://modules/${autoload.moduleId}/${autoload.path}"`,
    ),
    'ScreenshotCapture="*res://game/_generated/screenshot.gd"',
    '',
    '[display]',
    'window/size/viewport_width=1280',
    'window/size/viewport_height=720',
    '',
    '[rendering]',
    'renderer/rendering_method="gl_compatibility"',
    'renderer/rendering_method.mobile="gl_compatibility"',
    'environment/defaults/default_clear_color=Color(0.12, 0.2, 0.15, 1)',
    '',
  ];
  return lines.join('\n');
}

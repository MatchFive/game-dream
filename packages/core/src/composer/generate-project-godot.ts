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
    ...autoloads.map(
      (autoload) =>
        `${autoload.name}="*res://modules/${autoload.moduleId}/${autoload.path}"`,
    ),
    '',
    '[display]',
    'window/size/viewport_width=1280',
    'window/size/viewport_height=720',
    '',
    '[rendering]',
    'renderer/rendering_method="gl_compatibility"',
    'renderer/rendering_method.mobile="gl_compatibility"',
    '',
  ];
  return lines.join('\n');
}

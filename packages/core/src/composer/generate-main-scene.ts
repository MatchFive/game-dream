import type { ModuleRecord } from '../registry/types.js';

interface UiMount {
  slot: string;
  scene: string;
  layer: number;
  moduleId: string;
}

export function generateMainScene(modules: ModuleRecord[]): string {
  const game = modules.find((module) => module.manifest.main_scene);
  const uiMounts: UiMount[] = modules.flatMap((module) =>
    module.manifest.ui_mounts.map((mount) => ({
      ...mount,
      moduleId: module.manifest.id,
    })),
  );

  const extResources: Array<{ id: string; type: string; path: string }> = [
    {
      id: '1',
      type: 'Script',
      path: 'res://game/_generated/main.gd',
    },
  ];
  let nextId = 2;

  if (game?.manifest.main_scene) {
    extResources.push({
      id: String(nextId++),
      type: 'PackedScene',
      path: `res://modules/${game.manifest.id}/${game.manifest.main_scene}`,
    });
  }

  const mountIds = new Map<UiMount, string>();
  for (const mount of uiMounts) {
    const id = String(nextId++);
    mountIds.set(mount, id);
    extResources.push({
      id,
      type: 'PackedScene',
      path: `res://modules/${mount.moduleId}/${mount.scene}`,
    });
  }

  const lines = [
    `[gd_scene load_steps=${extResources.length + 1} format=3]`,
    '',
    ...extResources.map(
      (resource) =>
        `[ext_resource type="${resource.type}" path="${resource.path}" id="${resource.id}"]`,
    ),
    '',
    '[node name="Main" type="Node"]',
    'script = ExtResource("1")',
  ];

  if (game?.manifest.main_scene) {
    lines.push('', '[node name="Game" parent="." instance=ExtResource("2")]');
  }

  for (const mount of uiMounts) {
    const nodeName = mount.slot.replace(/[^A-Za-z0-9_]/g, '_');
    lines.push(
      '',
      `[node name="${nodeName}" parent="." instance=ExtResource("${mountIds.get(mount)}")]`,
      `layer = ${mount.layer}`,
    );
  }

  return `${lines.join('\n')}\n`;
}

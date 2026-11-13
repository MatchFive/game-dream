import type { ModuleRecord } from '../registry/types.js';

export function generateMainScene(modules: ModuleRecord[]): string {
  const hud = modules.find((module) => module.manifest.id === 'ui.hud');
  const hudScene = hud?.manifest.ui_mounts[0]?.scene ?? 'scenes/hud.tscn';
  return `[gd_scene load_steps=3 format=3]

[ext_resource type="Script" path="res://game/_generated/main.gd" id="1"]
[ext_resource type="PackedScene" path="res://modules/ui.hud/${hudScene}" id="2"]

[node name="Main" type="Node"]
script = ExtResource("1")

[node name="HUD" parent="." instance=ExtResource("2")]
`;
}

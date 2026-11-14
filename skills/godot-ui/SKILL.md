# Godot UI Skill

Use this when building HUDs, menus, overlays, or diegetic UI.

## Structure

- Use `CanvasLayer` for HUD/menus; keep gameplay world nodes out of it.
- Build with `Control` + containers (`MarginContainer`, `VBoxContainer`,
  `HBoxContainer`, `GridContainer`) rather than absolute positions.
- Use anchor presets and `size_flags_*` for responsive layouts.
- Use `PanelContainer`/`StyleBoxFlat` for readable panels and `Theme` resources
  for reusable colors, fonts, and spacing.
- Keep one focus chain for keyboard/gamepad navigation; set `grab_focus()` on
  the first actionable control.

## Demo HUD

- Top: timer/wave, health bar, XP bar, weapon/status text.
- Center: level-up choice panel with keyboard hints and clear selected state.
- Bottom: controls hint, only when relevant.
- Use `Label`/`ProgressBar` for data, not custom drawing, unless the visual is
  genuinely diegetic.
- Reserve safe margins and test at 1280×720 and a narrow mobile viewport.

## Godot MCP

When `--mcp-config` is available, prefer MCP `create_scene`, `add_node`, and
`save_scene` for Control hierarchies. If MCP is unavailable, write `.tscn` and
`.gd` files directly and call `check_script`.

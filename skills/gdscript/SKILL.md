# GDScript Development Skill

Use this whenever editing generated Godot code. The formatting rules below
follow the official Godot GDScript style guide (tabs, LF, UTF-8, naming,
formatting) and the official `--check-only --script` workflow.

## Syntax rules

- Indent with tabs, one level per block. Never mix spaces and tabs.
- Use LF line endings, UTF-8 without BOM, and one final newline.
- Every `match` pattern needs an indented block, even if it contains one call.
- Every `if`, `for`, `while`, `func`, and `match` body must be indented.
- Keep the project's existing warning-as-error style: annotate Variant values
  explicitly (`var target: Variant = ...`), and use `absi`/`maxf`/`minf` where
  types are ambiguous.
- Use `snake_case` for functions/variables, `PascalCase` for classes/nodes, and
  `CONSTANT_CASE` for constants. Keep lines under 100 characters.
- Keep two blank lines between top-level functions; use one blank line between
  logical sections inside a function.
- Prefer `and`/`or`/`not` over `&&`/`||`/`!`.
- Do not edit generated `modules/` or `game/_generated/`; edit `.gamedream/`
  source and run `compose`.
- Preserve marker strings exactly. A marker printed in code must also appear in
  the template `acceptance_markers` list.

## Official references

- Godot GDScript style guide:
  <https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_styleguide.html>
- Godot command line (`--check-only`, `--script`, `--path`):
  <https://docs.godotengine.org/en/4.4/tutorials/editor/command_line_tutorial.html>

## Required loop after editing

1. `compose`
2. `check_script` for every modified `.gd` file, using its generated path
   (`res://modules/...` relative path)
3. `verify`
4. If a gate fails, inspect the exact error and patch the smallest source block

Do not wait for G2 to discover syntax errors. A failing `check_script` must be
fixed before `verify`.

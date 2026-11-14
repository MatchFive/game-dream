# GDScript Development Skill

Use this whenever editing generated Godot code.

## Syntax rules

- Indent with tabs, one level per block. Never mix spaces and tabs.
- Every `match` pattern needs an indented block, even if it contains one call.
- Every `if`, `for`, `while`, `func`, and `match` body must be indented.
- Keep the project's existing warning-as-error style: annotate Variant values
  explicitly (`var target: Variant = ...`), and use `absi`/`maxf`/`minf` where
  types are ambiguous.
- Do not edit generated `modules/` or `game/_generated/`; edit `.gamedream/`
  source and run `compose`.
- Preserve marker strings exactly. A marker printed in code must also appear in
  the template `acceptance_markers` list.

## Required loop after editing

1. `compose`
2. `check_script` for every modified `.gd` file, using its generated path
   (`res://modules/...` relative path)
3. `verify`
4. If a gate fails, inspect the exact error and patch the smallest source block

Do not wait for G2 to discover syntax errors. A failing `check_script` must be
fixed before `verify`.

# Godot export evidence

`smoke.log` records a real Windows player export on 2026-11-27:

- Godot `4.4.1.stable.official.49a5bc7b6` (console binary)
- Export templates `4.4.1.stable` installed under `%APPDATA%/Godot/export_templates`
- `pnpm smoke:godot-export -- --require` composed the M1 fixture (31 modules) and
  produced `build/game.exe`, 97,656,240 bytes

It also records `pnpm smoke:godot` (G1/G2/G3 against the real engine): all
three gates pass with `engine=present`, which exercises the retry/crash
classification from X3 on a real binary rather than a fake runner.

The same log records the "templates missing" path, which must keep exiting
non-zero under `--require` and must print the download URL plus the exact
target directory.

# Releasing a Godot Build

Generated Godot projects include `export_presets.cfg` with Windows, Linux, and
Web presets. Presets are created only when missing, so user edits survive
recompose.

## Source release package

```bash
dream godot package --path ./game --out ./release/game-source
```

The package includes the project, modules, game content, assets, and export
presets, but excludes `.godot/`, `build/`, `screenshots/`, backups, logs, and
temporary files. `release.json` records content sizes and SHA-256 hashes.
Use `--force` to replace an existing package.

## Native export

Install the matching Godot 4.4 export templates first. Then:

```bash
dream godot export --path ./game --preset "Windows Desktop" --out ./build/game.exe
# debug template:
dream godot export --path ./game --preset "Linux" --out ./build/game.x86_64 --debug
```

The command imports the project, then runs Godot's `--export-release`/`
--export-debug`. If templates (or Windows rcedit) are missing it exits 3 and
recommends `dream godot package` for a source release; it never pretends an
export succeeded without the output file. The preset name must exist in
`export_presets.cfg`. Windows exports may require configuring rcedit in Godot's
editor settings.

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

## Installing export templates

The editor route (Editor > Manage Export Templates > Download) is the slowest
path: it re-downloads a 1.2 GB package. The CLI tells you exactly what is
missing and where it belongs:

```bash
dream godot templates            # installed / missing + expected directory
dream godot templates --json     # machine-readable, exit 1 when incomplete
dream godot templates --platform windows
```

When templates are missing it prints the official download URL for the exact
version and the directory to extract into:

```bash
curl -L -o templates.tpz \
  https://github.com/godotengine/godot/releases/download/4.4.1-stable/Godot_v4.4.1-stable_export_templates.tpz
unzip -q templates.tpz -d /tmp/tpl
cp /tmp/tpl/templates/* "$APPDATA/Godot/export_templates/4.4.1.stable/"
dream godot templates            # now reports installed
```

The release tag uses a hyphen (`4.4.1-stable`) while the directory uses a dot
(`4.4.1.stable`). A full install is about 1.9 GB on disk (35 files, all
platforms); the Windows player alone needs
`windows_debug_x86_64.exe` and `windows_release_x86_64.exe`.

## Native export

Install the matching Godot 4.4 export templates first. The local smoke is:

```bash
GODOT_BIN=/path/to/godot pnpm smoke:godot-export -- --out dist/godot-export
```

Without templates it prints `GODOT_EXPORT_SKIP=1` and exits 0. Add `--require`
to make missing templates a failure (CI uses this). The script composes the M1
fixture and exports the host platform player.

A verified run on Windows produced a 97 MB `build/game.exe` in about 15 s; see
`docs/evidence/godot-export/smoke.log`.

Manual export:

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

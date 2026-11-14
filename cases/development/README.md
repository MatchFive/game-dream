# Development Cases

These cases exercise the project as a **developer**, not the template router.

Input is a short text prompt plus a skill. `dream develop` runs a tool loop:
scaffold a project from the skill kit, verify it with real Godot, inspect
failures, patch files, and finish only when the gates pass.

## Run the survivor demo case

```bash
GODOT_BIN=/path/to/Godot_v4.4.1-stable_win64_console.exe \
  dream develop \
  --case cases/development/survivor-demo.json \
  --out ./build/survivor-demo \
  --provider fake
```

`--provider fake` uses a deterministic scripted developer for offline
integration testing. Set `OPENAI_API_KEY` and use `--provider openai` to let a
model choose tools and edit the generated project. A minimal input is
`cases/development/simple-survivor.json`; observed issues from real runs live in
`ISSUES.md`.

MCP-assisted example:

```powershell
dream develop --case cases/development/mcp-survivor-demo.json `
  --out build/mcp-survivor --provider openai `
  --mcp-config "$env:USERPROFILE\.commandcode\mcp.json" --visual
```

Tools available to the developer:

- `scaffold` — copy the selected skill kit and compose the initial project
- `compose` — regenerate composer output after editing the kit source
- `check_script` — parse a generated `.gd` file with Godot before verify
- `read_file` / `write_file` / `list_files` — inspect and patch kit/generated code
- `mcp` — call a discovered Godot MCP tool when `--mcp-config` is supplied
- `verify` — run G1/G2/G3 (and G6 with `--visual`)
- `finish` — end the run after verification and case markers pass

Skills live in `skills/<name>/SKILL.md` with an optional `kit/` starting
project. The survivor skill is `skills/survivor-demo`; `skills/gdscript`,
`skills/godot-ui`, `skills/game-feel`, and the vendored MIT
`skills/godot-gdscript-patterns` are loaded automatically as base skills.
`read_skill` exposes their references to the developer model.

## Current limitation

The fake provider executes a deterministic scaffold/verify/finish path. A real
model run depends on the provider's ability to follow the JSON action protocol;
the tool loop records every action and returns verification failures for repair.

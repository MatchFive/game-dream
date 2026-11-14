# Plan 51: MCP Bridge and UI/Game-Feel Skills

## Goal

Make editor/scene/UI operations available to the project's developer model,
not only to the Command Code assistant session.

## Implementation

- `mcp.ts`: minimal stdio MCP client (initialize, tools/list, tools/call).
- `dream develop --mcp-config` starts the configured server and exposes its
  tools through the `mcp` action.
- The developer prompt lists discovered MCP tools; tool calls are recorded in
  the normal action transcript.
- User-scope MCP config uses `@coding-solo/godot-mcp` and `npx.cmd` on Windows.
- Added `godot-ui` and `game-feel` base skills for scene/HUD/motion quality.
- Existing UI/GDScript skills are loaded automatically.

## Evidence

- MCP handshake found 14 tools:
  `launch_editor`, `run_project`, `get_debug_output`, `stop_project`,
  `get_godot_version`, `list_projects`, `get_project_info`, `create_scene`,
  `add_node`, `load_sprite`, `export_mesh_library`, `save_scene`, `get_uid`,
  `update_project_uids`.
- `get_godot_version` returned `4.4.1.stable.official.49a5bc7b6`.
- `dream develop --mcp-config ... --provider fake` completed scaffold/verify/
  finish with 14 discovered MCP tools.
- G1/G2/G3 passed with the MCP-enabled run.

## Limits

- MCP is optional and requires a running/installable server; it is not used when
  `--mcp-config` is omitted.
- MCP does not automatically improve art; UI/game-feel skills still need source
  changes and case verification.
- The bridge uses newline-delimited JSON-RPC and currently targets the
  Coding-Solo Godot server.

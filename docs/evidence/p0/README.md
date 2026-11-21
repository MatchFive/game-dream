# P0 MCP Scene/UI Smoke

`scripts/mcp-scene-smoke.mjs` drives the real Godot MCP server:

1. connect over stdio and list tools;
2. `create_scene` with a `Control` root;
3. `add_node` a `ColorRect` backdrop and a `Label`;
4. `save_scene`;
5. verify the generated `.tscn` contains the expected nodes.

This is a repeatable project-runtime MCP case, not an assistant-only tool call.

```bash
corepack pnpm build
node scripts/mcp-scene-smoke.mjs \
  --config "$USERPROFILE/.commandcode/mcp.json" \
  --project C:/temp/gd-mcp-scene \
  --scene ui/McpHud.tscn
```

Evidence: `docs/evidence/p0/mcp-scene-smoke.log` and
`docs/evidence/p0/McpHud.tscn`.

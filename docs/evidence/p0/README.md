# P0 Evidence

## Release validation (clean)

- `final-typecheck.log`: `pnpm typecheck` exit 0.
- `final-build.log`: `pnpm build` exit 0.
- `final-vitest.log`: 52 test files passed / 6 skipped; **209 tests passed / 9 skipped**, exit 0.
- `clean-demo.log`: normal fake-provider run, G1/G2/G3 pass, `Demo ready`, exit 0.

## MCP scene/UI smoke

`scripts/mcp-scene-smoke.mjs` drives the real Godot MCP server:

1. connect over stdio and list tools;
2. `create_scene` with a `Control` root;
3. `add_node` a `ColorRect` backdrop and a `Label`;
4. `save_scene`;
5. verify the generated `.tscn` contains the expected nodes.

```bash
corepack pnpm build
node scripts/mcp-scene-smoke.mjs \
  --config "$USERPROFILE/.commandcode/mcp.json" \
  --project C:/temp/gd-mcp-scene \
  --scene ui/McpHud.tscn
```

Evidence: `mcp-scene-smoke.log` and `McpHud.tscn`.

## Negative tests

`permission-deny-cli.log` is a deliberate permission-denial test using
`--deny-tool scaffold`. Its exit 2, G1 fail, and G2/G3 skip are expected and are
not release validation evidence.

## Audio

`bgm-generation.log` and `bgm-playback.log` cover MiniMax Music 3 generation and
the windowed `GAMEDREAM_BGM_OK` playback marker.

# P0 Evidence

## Release validation (clean)

- `final-typecheck.log`: `pnpm typecheck` exit 0.
- `final-build.log`: `pnpm build` exit 0.
- `final-vitest.log`: 52 test files passed / 6 skipped; **209 tests passed / 9 skipped**, exit 0.
- `clean-demo.log`: normal fake-provider run, G1/G2/G3 pass, `Demo ready`, exit 0.

The evidence directory intentionally contains no failed/negative permission run.

## MCP scene/UI smoke

`scripts/mcp-scene-smoke.mjs` drives the real Godot MCP server:

- `mcp-scene-smoke.log` records `MCP_TOOL_COUNT=14`,
  `MCP_GODOT_VERSION=4.4.1.stable.official.49a5bc7b6`,
  `MCP_SMOKE_EXIT=0`, and the generated node list.
- `McpHud.tscn` contains `Control`, `ColorRect`, and `Label` nodes.

## Audio

- `bgm-generation.log`: MiniMax Music 3 prompt/save output.
- `bgm-playback.log`: windowed Godot playback with `GAMEDREAM_BGM_OK` and
  `BGM_PLAY_EXIT=0`.
- BGM asset: `modules/system.survivor/assets/bgm.mp3`,
  969,572 bytes, SHA-256
  `CC06151C15EC2077DE1AF96336E73DB727DE6181F542D95FABB6BDDFB367B0A8`.

## Tool permissions

Permission behavior is covered by `packages/cli/test/permissions.test.ts`
(allow / deny / ask / auto-approve). `docs/permissions.md` documents the
`.gamedream/permissions.json` policy and CLI flags.

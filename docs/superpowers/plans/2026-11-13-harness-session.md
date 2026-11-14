# Plan 52: DSH-Inspired Structured Session

## Goal

Replace the flat `system + growing user string` development transcript with a
DSH-inspired append-only session that preserves a stable prompt prefix and
reduces context cost.

## Implemented

- `AgentSession` in `@gamedream/agent`:
  - immutable system prefix
  - append-only assistant/tool/user messages
  - stable prefix hash
  - explicit context compaction
- OpenAI-compatible provider gains optional `completeChat(messages)`.
- `dream develop` uses structured messages for real providers and keeps the
  legacy transcript path for simple/fake providers.
- MCP tool list is sorted before prompt assembly.
- Tool results are capped at 24k characters before entering the session.
- Context compacts to a bounded recent window when the budget is exceeded.

## Evidence

- `AgentSession` unit tests cover stable prefix, message shape, and compaction.
- Real provider finish case:
  `3 steps scaffold -> verify -> finish`, G1/G2/G3/G6 pass, 146 colors.
- Existing lower-level tests remain green.

## Next

- Move from JSON text actions to native tool calls with stable tool schemas.
- Add token/cache metrics from provider usage.
- Persist sessions and support resume/checkpointing.
- Use explicit cache boundaries/compaction policy from DSH.

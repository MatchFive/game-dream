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

- `AgentSession` unit tests cover stable prefix, message shape, compaction, and
  serialization.
- Real provider finish case:
  `2 steps verify -> finish`, G1/G2/G3/G6 pass, 146 colors.
- Usage: `2 calls · prompt 5839 · cached 5632 (96.5%) · completion 403`.
- Resume case: `--resume` replayed the saved session and finished with
  `prompt 9440 · cached 8960 (94.9%)`.
- Existing lower-level tests remain green.

## Event log and loop

`AgentSession` now stores durable session events (`turn/start`, `step/start`,
`tool/result`, `step/end`, `turn/end`, `session/compact`) and projects only
message events into model history. `AgentLoop` owns the turn/step lifecycle and
tool execution; the CLI only supplies tools, finish policy, and persistence.

Real provider evidence after the extraction:
`2 calls · prompt 5839 · cached 5632 (96.5%)`, G1/G2/G3/G6 pass.

## Native tool calls

- OpenAI-compatible provider now sends stable `tools` schemas when native
  development is enabled and parses `tool_calls`.
- `AgentLoop` executes assistant tool calls, appends tool results with call ids,
  and keeps JSON action parsing as a fallback.
- Session events preserve assistant tool-call batches and tool results.
- Real provider finish case: `2 calls`, G1/G2/G3/G6 pass, 146 colors.
- `AgentLoop` native-path unit test covers echo + finish and usage aggregation.

## Streaming

- OpenAI-compatible provider supports SSE `stream: true` with `include_usage`.
- AgentLoop consumes streamed content/tool-call deltas and keeps cancellation
  signals; non-streaming remains the fallback.
- Real provider native stream: 4 calls, 88.9% cached, G1/G2/G3/G6 pass.

## Next

- Add session generation/JSONL persistence and forks/checkpoints.
- Add provider-independent plugin/tool registry packaging.
- Add explicit cache boundary controls where the provider supports them.

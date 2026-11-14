# Plan 57: P2 JSONL Generations

## Goal

Make a session's lineage explicit when a saved session is forked: JSONL now
carries a generation header, and resume preserves generation metadata instead
of resetting it.

## Implemented

- `AgentSession.generation`, `parentGeneration`, `parentCheckpoint`, and
  `generationCreatedAt`.
- `fork()` increments generation and records the parent checkpoint.
- `toJSON()`/`fromJSON()` persist lineage.
- `toJSONL()` starts with a `session/generation` header; `fromJSONL()` restores it.
- `dream develop` reports the active generation; resume reads lineage fields.
- Tests cover generation 1 → 2 → 3 through forks and JSONL round-trips.

## Next P2 items

- Replaceable agent loop / plugin tree.
- Explicit provider cache breakpoint.
- Multi-agent orchestration.

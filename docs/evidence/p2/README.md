# P2 Agent Features

Raw evidence for P2.

## JSONL generations

- `fork-generation.log`: `dream develop --resume --fork cp-1` printed
  `generation 2`, G1/G2/G3 pass, exit 0.
- `session.jsonl` starts with a `session/generation` header containing
  `generation`, `parentGeneration`, and `parentCheckpoint`.
- `AgentSession` tests cover generation 1 -> 2 -> 3 and JSONL/JSON round-trips.

## Plugin tree, cache breakpoint, multi-agent

- `feature-tests.log`: `AgentPluginTree` parent/child tool replacement and
  lifecycle hooks; `prompt_cache_key` boundary; two independent agents run in
  parallel and aggregate usage.
- `typecheck.log`: 7 workspace typechecks pass.
- `vitest.log`: 48 test files passed / 6 skipped; 195 tests passed / 9 skipped.

## Commands

```text
corepack pnpm typecheck
corepack pnpm vitest run
corepack pnpm vitest run packages/agent/test/harness-p2.test.ts \
  packages/agent/test/openai-provider.test.ts
```

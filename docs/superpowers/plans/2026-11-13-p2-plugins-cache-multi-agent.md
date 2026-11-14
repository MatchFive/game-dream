# Plan 58: P2 Plugin Tree, Cache Breakpoints, Multi-Agent

## Implemented

### Plugin tree

- `AgentPluginTree<TContext>` supports nested nodes, tool replacement by name,
  and lifecycle hooks (`onStepStart`, `onToolResult`, `onFinish`).
- `AgentLoop` resolves its effective tools through the tree; a child plugin can
  replace a parent tool without changing the loop.
- Test covers parent/child override and hook order.

### Cache breakpoint

- `ChatRequest.cacheKey` carries an explicit stable prefix boundary.
- `AgentLoop` option `cacheBreakpoints` sends `session.prefixHash()` as the key.
- OpenAI-compatible provider emits `prompt_cache_key` in both streamed and
  non-streamed requests.
- CLI: `dream develop --cache-breakpoints`.

### Multi-agent

- `MultiAgentCoordinator` runs named `AgentLoop`s sequentially or in parallel.
- Each agent has its own session/context/plugin tree; usage and actions are
  aggregated without sharing mutable transcripts.
- Test covers two parallel agents and independent sessions.

## Verification

- Focused tests in `packages/agent/test/harness-p2.test.ts` and
  `packages/agent/test/openai-provider.test.ts`.
- Full typecheck/test results are captured under `docs/evidence/p2/`.

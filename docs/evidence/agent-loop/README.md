# Studio / Agent loop evidence

Commit: implementation commits `805c7e7` and `d2bb120`, with evidence commits following on `master`; synced to `D:\project\game_dream`.

## Validation commands

| Evidence | Result |
|---|---|
| `typecheck.log` | `corepack pnpm typecheck` exit `0` |
| `build.log` | `corepack pnpm build` exit `0` |
| `vitest.log` | 55 files passed, 6 skipped; **220 tests passed**, 9 skipped; exit `0` |
| `agent-tests.log` | `corepack pnpm test:agent`; CLI structured-event/approval, SSE, recovery, and Studio AgentManager tests; **7 passed**; exit `0` |
| `studio-agent-smoke.log` | `corepack pnpm smoke:agent`; real `dream develop` child through Studio API; approval round-trip and all required event types; exit `0` |

## Structured event and approval smoke

`scripts/studio-agent-smoke.mjs` starts the real CLI as a child of the Studio
server, waits for `approval/request`, writes an allow decision, and then reads
the final batch. The smoke uses `scripts/fixtures/fake-godot`, which reports
version `4.4.1`, accepts import, and emits the generated project's acceptance
markers. This keeps the smoke focused on the Agent/Studio loop rather than
requiring a local Godot installation. The captured successful run proves:

- `AGENT_APPROVAL_STATUS=awaiting-approval`
- `AGENT_APPROVAL_TOOL=scaffold`
- required events include `run/start`, `session/event`, `tool/start`,
  `approval/request`, `approval/decision`, `tool/end`, and `run/end`
- `AGENT_FINAL_STATUS=finished`
- `AGENT_REPORT_FINISHED=true`
- `AGENT_REPORT_STEPS=3`
- `AGENT_SCORE=1400`
- `AGENT_APPROVAL_FLOW_OK=1`

The fixture Godot is not an engine test; it deliberately makes the marker-based
G2/G3 gates pass so the Studio/Agent orchestration can be verified without
depending on an installed editor. Real-engine validation remains separate.

## Transport and restart recovery

- `packages/studio/test/agent.test.ts` opens `/api/agent/events`, asserts the
  `text/event-stream` response, consumes the initial snapshot, starts a run, and
  asserts that a pushed snapshot contains the active candidate.
- The same test file interrupts an awaiting-approval run by closing the first
  server, starts a new server on the same root, and verifies the persisted batch
  is resumed to `finished` with the pending approval expired and `run/end`
  present.
- `agent-tests.log` records all 7 focused tests passing.

## UI evidence

- `agent-awaiting.png`: pending approval card, tool trace, running state.
- `agent-candidates.png`: candidate A/B cards while awaiting approval.
- `agent-candidates-done.png`: both candidates scored and Apply enabled.
- `agent-final-empty.png`: final localized Studio with the Agent panel loaded.

The screenshots were taken against the Studio server using a fixture agent CLI
for deterministic approval/candidate UI. The real CLI path is separately covered
by `studio-agent-smoke.log` and the tests above.

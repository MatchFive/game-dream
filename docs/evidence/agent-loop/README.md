# Studio / Agent loop evidence

Commit: implementation commits `805c7e7`, `d2bb120`, and the token-budget/queue follow-ups on `master`; synced to `D:\project\game_dream`.

## Validation commands

| Evidence | Result |
|---|---|
| `typecheck.log` | `corepack pnpm typecheck` exit `0` |
| `build.log` | `corepack pnpm build` exit `0` |
| `vitest.log` | 55 files passed, 6 skipped; **230 tests passed**, 9 skipped; exit `0` |
| `agent-tests.log` | `corepack pnpm test:agent`; CLI structured-event/approval, policy, SSE, recovery, budget, queueing, and Studio AgentManager tests; **11 passed**; exit `0` |
| `budget-tests.log` | AgentLoop native-tool, total-token, and prompt-token budget tests; **3 passed**; exit `0` |
| `studio-agent-smoke.log` | `corepack pnpm smoke:agent`; real `dream develop` child through Studio API; approval round-trip and all required event types; exit `0` |

Real Godot runtime evidence is separate: `docs/evidence/runtime/README.md` and
`docs/evidence/runtime/godot-runtime.log` record a composed M1 project passing
G1/G2/G3 against Godot 4.4.1.

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
- `agent-tests.log` records all 11 focused tests passing.

## Playtest

- `packages/studio/test/studio.test.ts` starts a Studio server over a generated
  Web project, checks `/api/playtest/capabilities`, starts an iframe playtest,
  serves `/play/` and `/play/game.js`, then stops it.
- The same test uses root-absolute `/game.js` and `/style.css`, asserts the
  injected `<base href="/play/">`, the rewritten `src`/`href`, and the rewritten
  CSS `url("/play/bg.png")`.
- Dynamic JavaScript URLs are not rewritten yet; that remains V3b.
- The local runtime reports Godot `4.4.1` availability through
  `/api/playtest/capabilities`; the connected project itself has no
  `project.godot`, so pressing Play correctly reports “No playable Web or Godot
  project detected” instead of opening an empty frame.

## Candidate workflow

- The candidate test seeds a conflicting project file, asks for
  `candidates/:runId/diff`, and asserts the file is reported as `modified`.
- Applying the candidate creates `lastBackup` entries; the test then rolls back
  and verifies the original file content is restored.
- `studio-agent-smoke.log` still verifies the complete actual-CLI approval and
  finish path after these changes.

## BGM generation

- `POST /api/generate` with `{ "audio": true, "duration": 30 }` submits the
  MiniMax Music 3 workflow and polls ComfyUI audio outputs.
- `packages/studio/test/studio.test.ts` uses a local fake ComfyUI server and
  asserts the mp3 is written, the sidecar records `kind: audio`, and the file is
  indexed as an audio asset.
- The Asset Canvas **BGM** mode previews generated audio and can add it to the
  build. SFX and asset renaming remain AS2b.

## Animation sequence

- `POST /api/generate` with `{ "animation": true, "count": 2-4 }` creates jobs
  sharing one `animationId` with `frameIndex` and `frameCount`.
- The Asset Canvas **Animate** chip creates an `animation` node that groups the
  generated transparent frames, plays them, and can regenerate the sequence.
- `packages/studio/test/studio.test.ts` asserts animation job metadata and that
  animation canvas nodes persist through `saveCanvas`/`loadCanvas`.
- `agent-animation-node.png` shows a rendered 3-frame animation node.
- No sprite sheet/atlas packer or engine animation metadata yet (AS1b).

## Build selection

- Selecting an asset copies it under `game/build-assets/studio/` and writes
  `game/build-assets/manifest.json` with the original id, name, source, kind,
  MIME type, and staged path.
- `packages/studio/test/studio.test.ts` asserts the staged file and manifest,
  then unselects the asset and verifies the managed copy is removed.
- `packages/core/test/composer.test.ts` writes a `game/build-assets/` file,
  recomposes, and asserts the staged asset survives.
- Staged files are project assets; templates do not automatically reference them
  yet (AS5b).

## Approval policy

- `POST /api/agent/policy` persists `{ tools: { scaffold: "allow" } }` into
  `.gamedream/studio/agent-policy.json`.
- The focused test reads the file back and verifies the policy is returned by
  `GET /api/agent/policy`.
- The same test asserts `availableTools` and `source`, switches the default mode
  to `deny`, and verifies the per-tool override survives.
- The Studio Policy editor exposes the default plus every known tool with
  `allow` / `ask` / `deny`; see `agent-policy-editor.png`.
- The Studio “Always allow” button applies the current approval and records the
  policy for subsequent runs; the current child keeps its loaded gate.
- Parameter/argument-scoped rules are not implemented; that remains A3b.

## Token budget

- `packages/agent/test/harness-loop.test.ts` returns a provider response whose
  usage exceeds `maxTokens` and asserts the tool is never executed, `finished`
  is false, and `budgetExceeded` reports the limit and actual usage.
- `packages/cli/test/develop.test.ts` runs `dream develop` with a custom
  provider and `maxTokens: 1`, then asserts the report and JSONL events include
  the budget stop (`run/budget`) instead of a finished run.
- `packages/studio/test/agent.test.ts` starts a fixture Agent through the Studio
  API with `maxTokens`, then asserts the batch and candidate become
  `budget-exceeded` and the event stream contains `run/budget`.
- The Studio form exposes an optional **Token 预算** field; see
  `agent-budget-form.png`. Budget enforcement relies on provider-reported usage;
  providers without usage are documented as unenforceable.

## Agent queue

- `packages/studio/test/agent.test.ts` starts a first fixture batch and waits
  for approval, starts a second batch, and asserts `/api/agent` reports the
  second as `queued` with the first still active.
- The test cancels the queued batch and verifies it disappears from the queue,
  starts a third batch, cancels the active first batch, and asserts the third
  automatically becomes active (`awaiting-approval`) before finishing.
- `agent-queue.png` shows the real Studio UI with the active batch awaiting
  approval, two queued rows, and per-row **取消排队** actions.
- Batch-level concurrency remains one; candidates inside one batch still fan out
  in parallel.

## UI evidence

- `agent-awaiting.png`: pending approval card, tool trace, running state.
- `agent-candidates.png`: candidate A/B cards while awaiting approval.
- `agent-candidates-done.png`: both candidates scored and Apply enabled.
- `agent-final-empty.png`: final localized Studio with the Agent panel loaded.
- `agent-budget-form.png`: Agent composer with the optional Token 预算 field.
- `agent-queue.png`: active approval plus queued batches and cancel controls.
- `agent-policy-editor.png`: per-tool and default approval policy editor.
- `agent-animation-node.png`: three-frame animation canvas node with playback.

The screenshots were taken against the Studio server using a fixture agent CLI
for deterministic approval/candidate UI. The real CLI path is separately covered
by `studio-agent-smoke.log` and the tests above.

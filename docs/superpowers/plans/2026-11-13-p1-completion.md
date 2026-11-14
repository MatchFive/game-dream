# P1 Completion Evidence

P1 = fork/checkpoint + multi-candidate generation/selection + cross-engine.

## Fork / checkpoint

- `AgentSession.checkpoint(label)` records a durable checkpoint in
  `.gamedream/session.json` with `eventIndex`, `messageIndex`, and `createdAt`.
- `fork(checkpointId)` restores the message prefix at that checkpoint without
  mutating the source session.
- `rewind(checkpointId)` truncates the source event log and later checkpoints.
- `fromJSON` restores the event log and checkpoints after `--resume`.
- `AgentLoop` writes a checkpoint after every completed step.
- CLI: `dream develop --resume --fork <checkpoint-id>`.

## Multi-candidate generation

- `dream develop --candidates N` creates `candidate-1..N`.
- Each candidate has its own session and verification.
- Selection score: finished + required markers + G1/G2/G3 + G6 color count.
- Unit test composes two fake-provider candidates and selects the top score.

## Cross-engine

| Engine | Compose | Verify | Screenshot | Runtime evidence |
|---|---|---|---|---|
| Godot 4.4.1 | yes | G1/G2/G3 (+G6) | yes | survivor G1/G2/G3/G6 |
| Web | yes | `WEB_BOOT_OK`, `WEB_WIN` | yes | Web survivor screenshot 81 colors |
| Unity 6 | yes | static + runtime | yes | `UNITY_SIM_OK`, `UNITY_WIN` on 6000.6.9f1 |

Cross-engine parity currently covers the shared action-RPG M1 campaign and the
survivor slice; the remaining genre templates are still Godot-first. The P1
exit criterion is that each engine can scaffold, verify, screenshot, and run a
playable slice, not that every genre has a per-engine template.

## Verification commands

```text
corepack pnpm typecheck
corepack pnpm vitest run
node packages/cli/dist/index.js web compose --templates templates/web-survivor ...
node packages/cli/dist/index.js web verify --path ...
node packages/cli/dist/index.js unity compose --templates templates/unity-survivor ...
node packages/cli/dist/index.js unity verify --path ... --runtime --unity D:\Unity\6000.6.9f1\Editor
```

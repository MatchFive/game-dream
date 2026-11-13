# Plan 50: Development Case and Tool Loop

## Goal

Stop treating the survivor demo as a hand-maintained benchmark template. Add a
usage case where a short prompt drives a tool-using developer to produce a
playable project.

## Implementation

- `dream develop` command with a JSON action protocol.
- Tools: scaffold, read/write/list files, verify, finish.
- Skill: `skills/survivor-demo/SKILL.md` plus a Godot kit.
- Deterministic scripted provider for offline integration; OpenAI-compatible
  provider can choose the same tools online.
- Case: `cases/development/survivor-demo.json`.
- Generated project is composed and verified independently of the benchmark
  template router.

## Evidence

- `dream develop --case ... --provider fake`:
  - actions: scaffold -> verify -> finish
  - G1/G2/G3 pass
  - `--visual`: G6 pass (1280×720, 27 colors)
- Unit test covers case loading, tool execution, project files, and gates.
- Existing benchmark remains 7 playable / 0 fallback / 0 failed.

## Limits

- The fake provider uses a deterministic action script; it does not invent new
  gameplay code. Real model tool use needs `OPENAI_API_KEY`.
- The survivor skill kit is a starting point; arbitrary genre skills still need
  to be authored.
- Tools currently patch files but do not run interactive UI automation.

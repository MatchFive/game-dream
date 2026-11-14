# P2 Session Generations

Raw evidence for `AgentSession` generation lineage.

- `fork-generation.log`: `dream develop --resume --fork cp-1` printed
  `generation 2`, G1/G2/G3 pass, exit 0.
- `session.jsonl` first line:
  `{"type":"session/generation","generation":2,"parentGeneration":1,"parentCheckpoint":"cp-1",...}`.
- `AgentSession` tests cover generation 1 -> 2 -> 3 and JSONL/JSON round-trips.

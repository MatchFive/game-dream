# Plan 53: Multi-Candidate Development

## Goal

Generate several independent demos from the same prompt and select the best
verified candidate instead of accepting the first run.

## Implemented

- `dream develop --candidates N` creates `candidate-1..N` under `--out`.
- Each candidate has its own session, project, usage, and verification.
- Score: finished + required markers + G1/G2/G3 + G6 color count.
- CLI reports all candidate scores and the selected candidate.
- JSON output returns the full candidate report.

## Evidence

- `--candidates 2 --provider fake`: both candidates finished, selected
  `candidate-1`, G1/G2/G3 pass.
- Existing single-candidate path is unchanged.

## Limits

- Real-provider candidates cost N model runs; no shared KV prefix across
  candidates yet.
- Selection is heuristic; no human aesthetic review.

# Unity Puzzle

A Unity 6 cross-engine slice that reuses the shared Unity verification shell.

- Two-chamber push-puzzle simulation (GenreSim mode `puzzle`).
- Runtime bootstrap draws the arena/player and HUD.
- Headless verifier emits `UNITY_SIM_OK`, `UNITY_PUZZLE_START`, `UNITY_PUZZLE_PUSH`, and `UNITY_WIN`.
- Old `GameSim`/`SaveStore` remain for the shared static contract.

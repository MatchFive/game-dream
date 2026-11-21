# Unity Platformer

A Unity 6 cross-engine smoke slice that reuses the shared Unity verification shell.

- Deterministic four-stage platformer simulation (GenreSim mode `platformer`).
- Runtime bootstrap draws the arena/player and HUD.
- Headless verifier emits `UNITY_SIM_OK`, `UNITY_PLATFORMER_START`, `UNITY_PLATFORMER_JUMP`, and `UNITY_WIN`.
- Old `GameSim`/`SaveStore` remain for the shared static contract.

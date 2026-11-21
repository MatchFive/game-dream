# Unity Shooter

A Unity 6 cross-engine smoke slice that reuses the shared Unity verification shell.

- Deterministic three-wave top-down shooter simulation (GenreSim mode `shooter`).
- Runtime bootstrap draws the arena/player and HUD.
- Headless verifier emits `UNITY_SIM_OK`, `UNITY_SHOOTER_START`, `UNITY_SHOOTER_WAVE`, and `UNITY_WIN`.
- Old `GameSim`/`SaveStore` remain for the shared static contract.

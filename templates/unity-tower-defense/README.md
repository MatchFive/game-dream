# Unity Tower Defense

A Unity 6 cross-engine slice that reuses the shared Unity verification shell.

- Deterministic 5-wave tower-defense simulation (GenreSim mode `tower-defense`).
- Runtime bootstrap draws the arena/player and HUD.
- Headless verifier emits `UNITY_SIM_OK`, `UNITY_TOWER_START`, `UNITY_TOWER_WAVE`, and `UNITY_WIN`.
- Old `GameSim`/`SaveStore` remain for the shared static contract.

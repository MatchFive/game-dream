# Unity Roguelike

A Unity 6 cross-engine slice that reuses the shared Unity verification shell.

- Deterministic grid-run simulation (`GenreSim` mode `roguelike`).
- Three room slice: Entry Hall, Ash Market (cache + relic), and Vault (ambush),
  with gold/relic HUD and `UNITY_ROOM` / `UNITY_RELIC` markers.
- Runtime bootstrap draws the arena/player and HUD.
- Headless verifier emits `UNITY_SIM_OK`, `UNITY_ROGUELIKE_STEP`,
  `UNITY_ROGUELIKE_TURN`, `UNITY_ROOM`, `UNITY_RELIC`, and `UNITY_WIN`.
- Old `GameSim`/`SaveStore` remain for the shared static contract.

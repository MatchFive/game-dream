# GameDream Unity Equipment/Save Plan

**Goal:** Add Unity M1 equipment bonuses and local save/restore for inventory, equipment, level, HP, and quest progress, while keeping headless verification deterministic.

**Architecture:** Shared item `slot`/`bonuses` are embedded; `GameSim` auto-equips the first loot item per slot and uses effective damage/max HP. `SaveStore` serializes runtime state to `Application.persistentDataPath`; `GameBootstrap` loads only outside the editor (so screenshots/verifier stay deterministic), saves on level changes/win, and clears on restart.

## Global Constraints

- Headless `EditorVerifier` and editor screenshots never load an old save.
- Save is content-scoped and tolerates older/invalid files by ignoring them.
- Equipment bonuses affect damage/max HP like Godot; first item per slot wins.
- M0 and Web/Godot runtimes unchanged.
- No new dependencies.

## Evidence

- Unity `6000.6.9f1`, composed M1 at `C:\temp\gd-unity-save35`:
  - runtime verification exit 0 with `UNITY_LOOT_OK`, `UNITY_SAVE_OK`,
    `UNITY_QUEST_COMPLETE`, `UNITY_BOSS_PHASE`, `UNITY_WIN`.
  - `UNITY_SAVE_OK` comes from an actual SaveStore save/restore roundtrip in
    EditorVerifier; the verifier clears the test save afterward.
- `SaveStore` is player-only for normal load/save; EditorVerifier and editor
  screenshots do not load persistent saves.
- Equipment uses shared `slot`/`bonuses`; rusty sword adds attack, iron armor
  adds max HP and current HP at pickup.
- M1 Windows player build and `unity smoke` passed after equipment/save changes.

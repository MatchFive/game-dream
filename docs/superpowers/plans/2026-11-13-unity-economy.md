# GameDream Unity Economy/Quest UI Plan

**Goal:** Align Unity M1 economy and quest UI with the shared content: item names, deterministic loot drops, inventory counts, per-quest progress, and inventory/quest panels.

**Architecture:** `packages/unity` embeds shared `items` and `loot` arrays into `GameConfig.json`. `GameSim` builds item/loot maps, rolls drops on enemy death, and exposes inventory counts. `GameBootstrap` renders item counts and `I`/`Q` panels.

## Evidence

- Unity `6000.6.9f1`, composed M1 content at `C:\temp\gd-unity-m1-econ`:
  - runtime verification exit 0 with `UNITY_MAP_OK`, `UNITY_LOOT_OK`,
    `UNITY_QUEST_COMPLETE`, `UNITY_BOSS_PHASE`, `UNITY_WIN`.
  - content test: 6 items, 4 loot tables, wisp → `wisp_essence`.
- M0 remains itemless and uses the existing arena fallback.
- Loot tables are validated against every enemy kind; M1 runtime requires
  `UNITY_LOOT_OK` only when loot tables are embedded.

## Notes

- Loot uses the same deterministic LCG (seed 42) as Web; all shipped drops are chance 1.
- Unity HUD supports `I` inventory and `Q` quest panels; screenshots still exclude IMGUI HUD.

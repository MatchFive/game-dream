# system.survivor

## Behavior

- Top-down survivor arena with continuous spawns, crawlers, brutes, elites, and a boss.
- Auto-bolt, aura, and nova weapons; kills drop XP gems. Elites spawn every 7th
  spawn, carry extra HP, and award coins.
- XP levels pause the run and offer three upgrades. Manual choices use `1`/`2`/`3`;
  headless chooses automatically. Reaching level 3 evolves the bolt and prints
  `GAMEDREAM_EVOLUTION`.
- A boss spawns at 40 seconds and enters a stronger half-HP phase.
- Survive 60 seconds to print `GAMEDREAM_WIN`; zero HP prints `GAMEDREAM_LOSE`.
  Finished runs save coins/runs/wins to `user://survivor_meta.json`; meta damage
  and max HP are loaded on the next run.
- Markers: `GAMEDREAM_SURVIVOR_SPAWN`, `GAMEDREAM_SURVIVOR_LEVEL`,
  `GAMEDREAM_UPGRADE`, `GAMEDREAM_ELITE`, `GAMEDREAM_EVOLUTION`, `GAMEDREAM_BOSS`,
  `GAMEDREAM_BOSS_PHASE`, `GAMEDREAM_META_SAVED`.
- Headless mode uses time scaling and automatic upgrade choices for CI.
- SVG assets under `assets/` render the player, crawler, brute, boss, and gems;
  HUD and combat effects remain runtime-drawn.

## Inputs

`move_left`, `move_right`, `move_up`, `move_down`, `restart`, `upgrade_1`,
`upgrade_2`, `upgrade_3`.

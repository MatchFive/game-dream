# system.survivor

## Behavior

- Top-down survivor arena with continuous spawns, crawlers, brutes, and a boss.
- Auto-bolt, aura, and nova weapons; kills drop XP gems.
- XP levels pause the run and offer three upgrades. Manual choices use `1`/`2`/`3`;
  headless chooses automatically.
- A boss spawns at 40 seconds and enters a stronger half-HP phase.
- Survive 60 seconds to print `GAMEDREAM_WIN`; zero HP prints `GAMEDREAM_LOSE`.
- Markers: `GAMEDREAM_SURVIVOR_SPAWN`, `GAMEDREAM_SURVIVOR_LEVEL`,
  `GAMEDREAM_UPGRADE`, `GAMEDREAM_BOSS`, `GAMEDREAM_BOSS_PHASE`.
- Headless mode uses time scaling and automatic upgrade choices for CI.

## Inputs

`move_left`, `move_right`, `move_up`, `move_down`, `restart`, `upgrade_1`,
`upgrade_2`, `upgrade_3`.

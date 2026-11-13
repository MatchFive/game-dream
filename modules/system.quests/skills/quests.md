# Using system.quests

- Add quests to `game/content/quests/<id>.json`.
- Objectives are `{ type: "kill", target: "<enemy_kind>", count: N }`.
- Read state with `get_active()`; listen to `quest.changed`/`quest.completed`.

# system.quests

## Services
- `Game.get_service("quests")`

## Properties
- `completed_count: int`

## Methods
- `get_active() -> Array` — each item has `id`, `title`, `progress`, `count`, `completed`.

## Behavior
- Auto-accepts all quests loaded from `game/content/quests`.
- Listens to `enemy.died` with `{ kind }` and increments matching kill objectives.
- Emits `quest.changed` and `quest.completed`; ignores missing/invalid payloads.

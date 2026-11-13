# Using core.content

- Read items/skills/loot through `Game.get_service("content")`.
- Each JSON file must contain a stable `id`.
- Missing directories or invalid JSON are ignored; modules must handle empty dictionaries.

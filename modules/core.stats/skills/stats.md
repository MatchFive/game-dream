# Using core.stats

- Get the service with `Game.get_service("stats")`.
- Store numeric values with `set_stat("hp", 10.0)`.
- Read with `get_stat("hp")`; pass a default for optional stats.
- Listen to `stat_changed` for UI updates.

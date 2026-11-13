# Using system.progression

- Read state from `Game.get_service("progression")`.
- Call `add_xp(amount)`; the service handles level thresholds.
- Listen to `leveled_up` for rewards/UI.

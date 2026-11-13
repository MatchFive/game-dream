# Using system.levels

- Author levels in `game/content/levels/campaign.json`.
- Each level has an `enemy` object: `kind`, `max_hp`, `attack_damage`, `speed`, `x`, `y`.
- `advance()` moves to the next level; `has_next()` ends the campaign.

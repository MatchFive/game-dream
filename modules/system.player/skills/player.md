# Using system.player

- Instance `scenes/player.tscn` in the gameplay scene.
- The player is in group `player` and expects a `Health` child.
- Attack targets nodes in group `enemies` within `attack_range`.
- `skill_1` (K) casts `ember_bolt` when `system.skills` is installed.
- Equipment bonuses update `attack_damage` and `max_hp`.
- Tune `speed`, `attack_damage`, `attack_range` in the scene.

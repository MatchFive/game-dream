# Using system.survivor

- The module owns `scenes/arena.tscn`; it is mounted as the game scene.
- Survival duration, spawn rate, enemy speed, and XP thresholds are constants in
  `src/survivor.gd`.
- Rendering uses `_draw`; no external assets are required.

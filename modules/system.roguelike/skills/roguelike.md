# Using system.roguelike

- The module owns `scenes/dungeon.tscn`; it is mounted as the game scene.
- Dungeon dimensions, seed, HP, and enemy count are constants in `src/dungeon.gd`.
- The map is rendered with `_draw`; no external tileset is required.

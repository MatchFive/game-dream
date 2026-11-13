# Using system.map

- Call `Game.get_service("maps").build(parent, map_data)` once per level.
- Map rows use `#` walls and `.` floors; walls get static collisions.
- No external tileset files are required; floor/wall colors come from the map.
- Remove existing map nodes before rebuilding; `build` refuses a parent that still
  has a `Ground` layer. Use `is_wall`/`first_floor` for spawn validation.

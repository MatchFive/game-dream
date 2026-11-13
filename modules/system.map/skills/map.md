# Using system.map

- Call `Game.get_service("maps").build(parent, map_data)` once per level.
- Map rows use `#` walls and `.` floors; walls get static collisions.
- No external tileset files are required; floor/wall colors come from the map.

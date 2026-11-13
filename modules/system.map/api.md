# system.map

## Services
- `Game.get_service("maps")`

## Methods
- `build(parent: Node, data: Dictionary) -> bool` — returns false for missing data,
  empty/ragged-with-no-tiles rows, or an existing `Ground` layer.
- `is_wall(data: Dictionary, world_pos: Vector2) -> bool`
- `first_floor(data: Dictionary) -> Vector2`

## Map data
`{ id, tile_size, tileset: { floor, wall }, rows: string[] }`; `#` is a wall,
`.` is floor. Colors are hex strings. The builder generates a two-tile atlas at
runtime and adds a `TileMapLayer` plus a `StaticBody2D` of wall rectangles.

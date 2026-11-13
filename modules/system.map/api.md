# system.map

## Services
- `Game.get_service("maps")`

## Methods
- `build(parent: Node, data: Dictionary) -> bool`

## Map data
`{ id, tile_size, tileset: { floor, wall }, rows: string[] }`; `#` is a wall,
`.` is floor. Colors are hex strings. The builder generates a two-tile atlas at
runtime and adds a `TileMapLayer` plus a `StaticBody2D` of wall rectangles.

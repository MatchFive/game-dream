# system.sprites

## Services
- `Game.get_service("sprites")`

## Properties
- `applied_count: int`
- `applied: Dictionary`

## Methods
- `apply(sprite: AnimatedSprite2D, sprite_id: String) -> bool`
- `has_applied(sprite_id: String) -> bool`

## Sprite config
`{ id, texture, frame_size: [w, h], animations: { name: { frames, fps, loop } } }`.
Frames are horizontal atlas indices. The service builds `SpriteFrames` with
`AtlasTexture` regions and starts the `idle` animation when present.

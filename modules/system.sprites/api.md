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

## Generated animations
If `res://game/build-assets/animations/*.tres` exists, the service loads the
first `SpriteFrames` resource and uses it before content sprite configs. This is
the Studio-generated atlas path; it prints `GAMEDREAM_ANIMATION_OK` once when
applied. Missing or malformed resources fall back to the normal content config.

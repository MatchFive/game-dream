# Using system.sprites

- Keep a fallback visual (Polygon2D) and call `apply(animated_sprite, id)`.
- If it returns true, hide the fallback; otherwise leave it visible.
- Animations are `idle`, `move`, and `attack` in the shipped configs.

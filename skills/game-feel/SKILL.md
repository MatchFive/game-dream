# Game Feel Skill

Use this when a demo is mechanically correct but feels flat.

## High-value effects

- Hit flash: modulate the target and tween back in 0.08–0.15s.
- Screen shake: small camera offset on player damage and boss hits.
- Hit stop: pause or slow `Engine.time_scale` for 0.03–0.08s on heavy hits.
- Damage numbers: spawn short-lived labels with upward drift and fade.
- Pickup pop: scale a gem/coin briefly, then magnet it toward the player.
- Level-up: dim the world, scale the choice panel in, and pulse the selected
  option.
- Boss phase: color shift, ring pulse, and a short warning flash.
- Use `Tween` and `Timer`; avoid allocating nodes/tweens every frame.
- Keep effects readable: no full-screen flash that hides the player/HUD.

## Quality checks

- The HUD remains readable during effects.
- Input remains responsive during tweens.
- Effects are disabled or reduced in headless verification.
- G6 screenshot still has visible player/enemy/HUD contrast.

MCP can be used to inspect scene hierarchy and capture screenshots; gameplay
effects still require source changes and verification.

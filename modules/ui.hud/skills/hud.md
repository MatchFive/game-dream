# Using ui.hud

- Mount `scenes/hud.tscn` under the `hud` slot.
- The HUD binds to `inventory.changed`; update the label through the service API.
- Never read inventory internals directly.

# Plan 55: Web Survivor Cross-Engine Slice

## Goal

Start P1 cross-engine parity with a real, verifyable Web survivor demo rather
than a static template.

## Implemented

- `templates/web-survivor`: standalone Canvas/ESM survivor game.
- Shared `sim.mjs` drives browser and `sim-run.mjs`.
- Auto-attack, enemy chase, XP levels, 20-second survival, HUD, restart.
- `web compose --templates templates/web-survivor` + `web verify` + screenshot.

## Evidence

- `WEB_BOOT_OK`, `WEB_WIN`.
- Screenshot: `1280x720`, `81 colors`.
- Godot survivor remains the canonical platform; this is the first Web parity
  slice, not full parity.

## Limits

- Unity survivor parity is not done.
- Web uses Canvas primitives, not the Godot SVG assets.
- No shared content pack yet; the two survivor implementations are separate.

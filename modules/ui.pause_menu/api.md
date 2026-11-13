# ui.pause_menu

## UI
- Mount slot: `pause`, layer 30.
- Toggle: `pause` (Escape).
- Pauses the SceneTree; Resume unpauses; Save calls `core.save`; Quit exits.

## Notes
- `process_mode = 3` (always) so the menu can process while the tree is paused.

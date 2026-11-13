# ui.settings

## UI
- Mount slot: `settings`, layer 44, process mode always.
- Opens on `settings.open`; Back emits `settings.close` after saving and closing.
- Hides on `game.started`/`run.reset`; backdrop blocks clicks behind it.
- Music/SFX sliders and fullscreen checkbox write through `system.settings`.

# system.settings

## Services
- `Game.get_service("settings")`

## Properties
- `music_volume: float` (0–1)
- `sfx_volume: float` (0–1)
- `fullscreen: bool`

## Methods
- `set_music_volume(value: float)`
- `set_sfx_volume(value: float)`
- `set_fullscreen(value: bool)`
- `save() -> bool`

Settings persist to `user://settings.json` through a temp file and rename.

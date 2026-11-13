# system.audio

## Services
- `Game.get_service("audio")`

## Properties
- `initialized: bool`

## Methods
- `play_sfx(name: String) -> bool`

## Events
- `enemy.died` → hit
- `loot.dropped` → pickup
- `leveled_up` → level_up
- `skill.cast` → cast
- `quest.completed` → quest
- `game.won` / `game.lost` → win / lose
- `dialogue.line` → talk

Music loops on the `Music` bus; SFX use the `SFX` bus and a player pool.

# system.skills

## Services
- `Game.get_service("skills")`

## Methods
- `cast(skill_id: String, caster: Node) -> bool`

## Behavior
- Reads skill definitions from ContentDB (`damage`, `range`, `cooldown`).
- Enforces per-skill cooldowns.
- Damages enemies in group `enemies` within range.
- Emits `skill.cast` on success.

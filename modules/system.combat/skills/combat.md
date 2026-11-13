# Using system.combat

- Add a `Health` node with `health_component.gd` to any damageable entity.
- Set `max_hp` in the scene.
- Call `$Health.take_damage(amount)`.
- Listen to `died` for death behavior and `health_changed` for UI.

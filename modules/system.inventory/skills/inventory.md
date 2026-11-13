# Using system.inventory

- Get the service with `Game.get_service("inventory")`.
- Add items with `add_item("potion", 1)`.
- Listen to `changed` to update UI.
- Never modify `_items` directly.

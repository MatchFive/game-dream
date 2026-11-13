# Using core.save

- Call `Game.get_service("save").save_game()` / `load_game()`.
- Add a new serializable system by implementing `serialize()`/`deserialize()` and adding it to `SECTION_SERVICES`.

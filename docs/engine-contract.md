# Engine Gameplay Contract

`fixtures/contracts/engine-gameplay.json` is the shared contract for the
survivor and roguelike slices. It defines the common room names, event and relic
names, and the acceptance markers each engine must emit.

The contract test (`packages/cli/test/engine-contract.test.ts`) reads the Web,
Godot, and Unity sources and fails if any engine diverges. Engines keep their
native implementation, but the observable model is aligned:

- Survivor: elite and evolution markers on all engines, persistent meta on
  Web/Godot/Unity (Web uses `localStorage`, Godot `user://`, Unity
  `persistentDataPath`).
- Roguelike: Entry Hall → Ash Market → Vault, cache/ambush events, and `ember`
  in the shared contract.
- Common markers are emitted alongside the engine-prefixed markers; existing
  acceptance markers remain valid.

The contract is intentionally a source-level contract rather than a runtime
data loader. Moving room data into one serialized model would be the next step
if the templates need user-editable content.

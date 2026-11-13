# Using core.events

- Emit with `Game.events.emit_event("namespace.event", payload)`.
- Subscribe with `Game.events.event_emitted.connect(callable)` and filter by name.
- Use namespaced event names; never reuse a name for a different payload shape.

# Real Godot runtime evidence

`godot-runtime.log` is produced by:

```bash
GODOT_BIN=.tools/godot/Godot_v4.4.1-stable_win64_console.exe \
  pnpm smoke:godot --out C:/temp/gd-godot-runtime-smoke
```

The fixture composes `fixtures/specs/m1.yaml`, then runs `dream verify` against
the generated project with the real Godot 4.4.1 console executable. The log
records `G1=pass`, `G2=pass`, `G3=pass`, `engine=present`, and
`GODOT_RUNTIME_OK=1`.

CI mirrors this in the `godot-runtime` job: it downloads the official Godot
4.4.1 Linux binary, sets `GODOT_BIN`, and runs `pnpm smoke:godot`.

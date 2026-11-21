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

## Real Unity runtime evidence

`unity-runtime.log` is produced by:

```bash
UNITY_BIN="D:/unity/6000.6.9f1/Editor" \
  pnpm exec vitest run packages/unity/test/runtime.test.ts
```

The run passed all three runtime tests in 128s:

- `EditorVerifier.Run` in Unity batchmode (`UNITY_SIM_OK`, `UNITY_WIN`).
- Windows player build plus `UNITY_SMOKE_OK` runtime smoke.
- Unity screenshot generation.

The log records `3 passed` and `EXIT=0`. GitHub-hosted CI has no Unity; a
self-hosted runner is required for the same check. The optional `unity-runtime`
job in `.github/workflows/ci.yml` skips unless `UNITY_RUNTIME_ENABLED=true` and
`UNITY_BIN` are configured as repository variables. Studio can launch an
existing `Builds/Windows/*.exe` player but does not build Unity itself.

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

The log records `3 passed` and `EXIT=0`. A separate BGM player smoke is recorded
in `unity-runtime-bgm.log`: the survivor build stages
`Assets/StreamingAssets/game/build-assets`, loads the first audio asset, loops it,
and logs `UNITY_BGM_OK`; that test passes with `EXIT=0`.

GitHub-hosted CI has no Unity; a
self-hosted runner is required for the same check. The optional `unity-runtime`
job in `.github/workflows/ci.yml` skips unless `UNITY_RUNTIME_ENABLED=true` and
`UNITY_BIN` are configured as repository variables. Studio can launch an
existing `Builds/Windows/*.exe` player but does not build Unity itself.

## Godot native export

`godot-export-skip.log` records the current local state: Godot 4.4.1 is present
but export templates are missing, so `smoke:godot-export --require` exits 3 with
`GODOT_EXPORT_SKIP=1`. The CI `godot-export` job installs the official 4.4.1
templates and runs the same script with `--require`; missing templates fail that
job instead of producing a false pass.

## Unity release artifact

`unity-release.log` records the local `pnpm smoke:unity-release` run against
Unity 6000.6.9f1: `UNITY_RELEASE_OK=1`, player bytes, `smoke.log`, and
`Screenshots/unity.png`, exit `0`. The optional self-hosted CI job runs the same
script with `--require` and uploads `gamedream-unity-release-player`.

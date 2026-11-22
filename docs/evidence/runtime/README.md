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

## Godot generated animation

`godot-animation-e2e.log` records `sprite-e2e.test.ts` against real Godot 4.4.1.
The test composes M1, stages a transparent 2-frame atlas plus `.tres`, keeps the
normal content sprite configs, and verifies G3 with
`GAMEDREAM_ANIMATION_OK`, proving the generated resource takes precedence and
plays.

## Unity genre BGM

`unity-runtime-bgm-genre.log` records the staged-BGM and player-binding check
against the platformer template. The shared `BgmPlayer.cs` starts a looping
audio source, the shared `AssetBinding` replaces the player square with a staged
PNG, and the player smoke logs both `UNITY_BGM_OK` and
`UNITY_SPRITE_BINDING_OK`; this test passes with `EXIT=0`. The genre templates
now declare the audio, UnityWebRequest, and UnityWebRequestAudio modules.

## Godot sprite bindings

`godot-sprite-e2e.log` records the real Godot 4.4.1 sprite tests: missing
content fails G3, a generated atlas overrides content, and a staged
`bindings.json` player texture is applied without an atlas. The binding test
includes `GAMEDREAM_SPRITE_BINDING_OK` in the accepted markers and exits `0`.

## Real Godot MCP

`godot-mcp-real.log` records `scripts/mcp-scene-smoke.mjs` against
`@coding-solo/godot-mcp` with `GODOT_PATH` set to the local 4.4.1 console build.
It reports 14 tools, saves `ui/McpHud.tscn`, and verifies the
Control/ColorRect/Label node lines. The CI `godot-mcp` job runs the same script
and uploads the scene.

## Web survivor depth

`web-survivor-depth.log` records the Web survivor tests for elite spawns,
`bolt → storm` evolution, persistent meta coins/upgrades, and the headless
`WEB_WIN` loop. The simulator still wins automatically; Godot survivor depth
sync remains separate.

## Godot survivor depth

`godot-survivor-c1.log` is a real Godot 4.4.1 headless run of the composed
survivor fixture. It prints `GAMEDREAM_ELITE`, `GAMEDREAM_EVOLUTION`,
`GAMEDREAM_WIN`, and `GAMEDREAM_META_SAVED`; the run also passes `dream verify`
with G1/G2/G3.

## Unity survivor depth

`unity-survivor-depth.log` records the Unity EditorVerifier for the survivor
template: it emits `UNITY_ELITE`, `UNITY_EVOLUTION`, and `UNITY_WIN` with exit
`0`. The player runtime also reads/writes `survivor_meta.json` from
`Application.persistentDataPath`.

## Web roguelike rooms

`web-roguelike-rooms.log` records the seeded three-room Web roguelike tests:
entry/market/vault ordering, cache event, relic purchase, gold, deterministic
same-seed ordering, different-seed ordering, and the headless `WEB_WIN`.

## Godot roguelike rooms

`godot-roguelike-c2.log` is a real Godot 4.4.1 headless run: it prints
`GAMEDREAM_ROOM=Entry Hall`, `Ash Market`, `Vault`, plus cache/ambush, relic, and
`GAMEDREAM_WIN`; `dream verify` passes G1/G2/G3.

## Unity roguelike rooms

`unity-roguelike-rooms.log` records the Unity EditorVerifier for the roguelike
template; it emits `UNITY_ROOM`, `UNITY_RELIC`, and `UNITY_WIN` with exit `0`.

## Benchmark scoring

`benchmark-score.log` records the fake-provider benchmark with per-case
playability/intent scores and the aggregate score. `--visual` adds the G6
component when a real screenshot is available; skipped/failed visual checks do
not count as passes.

## Engine gameplay contract

The shared contract lives at `fixtures/contracts/engine-gameplay.json`; its test
reads the Web, Godot, and Unity survivor/roguelike sources and checks common
markers plus room/event/relic names. See `docs/engine-contract.md`.

## Web platformer stages

`web-platformer-stages.log` records the Web platformer regression for the three
stage layouts (Rooftops, Foundry, Skyline), stage transitions, coin collection,
and the headless `WEB_WIN`.

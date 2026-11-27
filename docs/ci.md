# CI and release checks

`.github/workflows/ci.yml` runs on pushes and pull requests:

- install with the frozen pnpm lockfile
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- a fixture-backed MCP client smoke: initialize, discover tools, add nodes,
  save a scene, and verify the scene file exists
- a real Godot runtime job: download Godot 4.4.1, compose the M1 fixture, and
  run `pnpm smoke:godot` with G1/G2/G3 against the actual engine
- a real Godot export job: install the 4.4.1 export templates, compose the M1
  fixture, run `pnpm smoke:godot-export -- --require`, and upload the exported
  Linux player artifact
- a real Godot MCP job: install Godot 4.4.1 and `@coding-solo/godot-mcp`, then
  create/add/save a scene and verify the saved Control/ColorRect/Label nodes;
  upload the scene as `gamedream-mcp-scene`

The fixture MCP server is `fixtures/mcp/fake-godot.mjs`. It exercises the same
stdio protocol and scene-save path as the real Godot MCP server, so CI catches
client regressions without requiring the editor on the Ubuntu runner.

## Windows job

`test-windows` runs the same install / typecheck / test / build sequence on
`windows-latest`, then composes and verifies a project whose output path
contains spaces and CJK characters (`dist/中文 项目/我的游戏`).

The job exists because Linux cannot catch this class of bug: `fs.cpSync` works
on Ubuntu for non-ASCII paths but raises `ENOENT` on Windows and can crash the
process with a native segmentation fault. See
`docs/evidence/windows-paths/README.md`.

GitHub's Ubuntu runner has no Godot export templates, so export tests remain
local/fake-runner based. The `godot-runtime` job downloads the official Godot
4.4.1 Linux binary for real headless G2/G3. Run it locally with the same script:

```bash
GODOT_BIN=/path/to/godot pnpm smoke:godot --out dist/godot-runtime
```

## Unity runtime

GitHub-hosted runners do not include Unity. The real Unity checks are:

```bash
UNITY_BIN="D:/unity/6000.6.9f1/Editor" \
  pnpm exec vitest run packages/unity/test/runtime.test.ts
```

This runs `EditorVerifier`, a Windows player build, runtime smoke, and a
screenshot. The latest local run passed all three tests against Unity
6000.6.9f1 (see `docs/evidence/runtime/unity-runtime.log`). A CI job requires a
self-hosted runner with Unity installed; without one, the test must be skipped
rather than reported as passing.

The optional `unity-runtime` workflow job uses a self-hosted Windows runner
labeled `unity`. Enable it with repository variables:

- `UNITY_RUNTIME_ENABLED=true`
- `UNITY_BIN=D:\unity\6000.6.9f1\Editor`

When the variables are absent, the job is skipped and does not report Unity as
verified. When enabled, it runs the runtime tests and
`pnpm smoke:unity-release -- --require`, then uploads
`gamedream-unity-release-player` (player, smoke log, screenshot).

`dream godot templates` reports whether matching export templates are installed
for the host platform.

The optional `web-release` job is manually dispatched. It composes the M2 Web
project, runs the deterministic marker gate, packages it with hashes, and uploads
`gamedream-web-release` as a workflow artifact. It does not require a browser.

## Godot templates

Native export needs the exact patch/status template version (for example
`4.4.1.stable`; a 4.4.0 template set is not interchangeable). The status command
reports the expected directory and exits 0 if the requested/host platform is
present, 1 if missing, and 3 if Godot is not found:

```bash
dream godot templates
dream godot templates --platform windows
dream godot templates --json
```

Install templates through the Godot editor (Editor > Manage Export Templates) or
from the official Godot download page, then rerun the command. Until they are
installed, `dream godot export` exits 3; `dream godot package` still produces a
source release and works without templates.

## Gate status and exit codes

`dream verify` (and anything that runs it: `create`, `develop`, `benchmark`)
reports four gate statuses:

| status | meaning |
| --- | --- |
| `pass` | gate ran and passed |
| `fail` | the project is wrong — a script error, missing marker, or bad export |
| `skip` | the gate could not run (engine missing, or an earlier gate failed) |
| `error` | the environment failed: Godot crashed repeatedly, or the run never reached the engine |

A native crash (Windows exit `3221225477` / `3221226356`) is retried twice with
backoff (300ms, 900ms). If it still crashes, the gate becomes `error` with an
`attempts` count and the message says it is an environment problem, not a
project failure — so crash-prone machines do not pollute playability statistics.

Exit codes follow the same split:

```
0  all gates passed
2  a gate failed (project problem)
3  a gate was skipped (engine missing)
4  a gate hit an environment error (engine crashed)
```

CI can therefore retry a job on 4 instead of reporting the project as broken.

`dream develop` also refuses to start when the target project already has a
`project.godot` and no engine can be found: it throws `Godot 4.4+ not found`
before the first model step, instead of burning steps on a run whose verify can
only return `skip`. Callers that intentionally run without an engine (tool-only
sandboxes) pass `allowMissingEngine`.

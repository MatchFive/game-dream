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

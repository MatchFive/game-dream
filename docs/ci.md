# CI and release checks

`.github/workflows/ci.yml` runs on pushes and pull requests:

- install with the frozen pnpm lockfile
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- a fixture-backed MCP client smoke: initialize, discover tools, add nodes,
  save a scene, and verify the scene file exists

The fixture MCP server is `fixtures/mcp/fake-godot.mjs`. It exercises the same
stdio protocol and scene-save path as the real Godot MCP server, so CI catches
client regressions without requiring the editor on the Ubuntu runner.

GitHub's Ubuntu runner has no Godot binary or Godot export templates, so the
real Godot E2E test is skipped there; export tests use fake runners. Run those
locally with `GODOT_BIN` set; `dream godot templates` reports whether the
matching templates are installed for the host platform.

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

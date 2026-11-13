# CI and release checks

`.github/workflows/ci.yml` runs on pushes and pull requests:

- install with the frozen pnpm lockfile
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

GitHub's Ubuntu runner has no Godot binary or Godot export templates, so the
real Godot E2E and native export tests are skipped there. Run those locally with
`GODOT_BIN` set; `dream godot templates` reports whether the matching templates
are installed.

The optional `web-release` job is manually dispatched. It composes the M1 Web
project, runs the deterministic marker gate, packages it with hashes, and uploads
`gamedream-web-release` as a workflow artifact. It does not require a browser.

## Godot templates

Native export needs the exact Godot 4.4 export template version. The status
command reports the expected directory:

```bash
dream godot templates
dream godot templates --json
```

Install templates through the Godot editor (Editor > Manage Export Templates) or
from the official Godot download page, then rerun the command. Until they are
installed, `dream godot export` exits 3; `dream godot package` still produces a
source release and works without templates.

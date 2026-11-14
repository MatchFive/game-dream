# P1 Evidence Logs

Raw command output captured from the worktree at the P1 completion commits.

## Commands and exits

| Log | Command | Exit |
|---|---|---|
| `typecheck.log` | `corepack pnpm typecheck` | 0 |
| `vitest.log` | `corepack pnpm vitest run` | 0 |
| `candidates-cli.log` | `dream develop --case cases/development/survivor-demo.json --provider fake --candidates 2` | 0 |
| `fork-cli.log` | `dream develop ... --resume --fork cp-1` | 0 |
| `web-survivor-verify.log` | `dream web compose --templates templates/web-survivor` + `dream web verify` | 0 |
| `web-platformer-verify.log` | `dream web compose --templates templates/web-platformer` + `dream web verify` | 0 |
| `godot-create-verify.log` | `dream create "..." --provider fake --templates templates` | 0 |
| `godot-verify.log` | `dream verify --path <godot survivor>` | 0 |
| `unity-runtime.log` | `dream unity verify --runtime --unity D:\Unity\6000.6.9f1\Editor` | 0 |

`vitest.log` ends with `47 passed / 6 skipped` test files and
`190 passed / 9 skipped` tests. The skipped tests are environment-gated e2e
suites; the Web and Unity engine paths are covered by the raw logs above.

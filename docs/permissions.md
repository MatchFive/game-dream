# Tool Permissions

`dream develop` supports a per-tool and argument/path-prefix permission policy
for mutating or privileged tools.

## Policy file

Place `.gamedream/permissions.json` in the project output directory, or pass
`--permissions <file>`:

```json
{
  "default": "ask",
  "tools": {
    "write_file": "ask",
    "compose": "ask",
    "mcp": "ask",
    "finish": "allow"
  },
  "rules": [
    {
      "tool": "write_file",
      "arg": "path",
      "prefix": "src/",
      "mode": "allow",
      "reason": "source tree"
    }
  ]
}
```

Modes:

- `allow` — execute without asking.
- `deny` — return a permission error to the model.
- `ask` — prompt once before executing.

Rules are evaluated from last to first. A rule matches when the tool matches
(or is `*`) and, when `arg` is set, that argument is a string/array entry whose
normalized path starts with `prefix`. Paths outside the prefix fall back to the
tool mode or default. Each decision emits a `permission/audit` event containing
the tool, mode, source (`rule`/`tool`/`default`), matched rule, and result.

`ask` requires an interactive terminal. In CI or non-interactive runs it is
denied with a message to use `--yes` or change the policy.

## CLI shortcuts

```bash
dream develop ... --deny-tool "mcp,write_file"
dream develop ... --ask-tool "compose"
dream develop ... --yes          # auto-approve ask tools
```

`--read-only` remains the strongest switch and denies all mutating tools before
the policy gate runs.

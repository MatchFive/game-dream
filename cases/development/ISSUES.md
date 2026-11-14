# Development Issues Log

Record real problems found while using `dream develop` to build game demos.

## 2026-11-13 — simple-survivor (OpenAI)

Command:

```powershell
node packages/cli/dist/index.js develop \
  --case cases/development/simple-survivor.json \
  --out C:\temp\gd-dev-simple \
  --provider openai --visual --max-steps 16
```

### Observed problems

1. **Godot import is intermittently unstable on Windows.**
   - First run: G2 failed with exit code `3221225477`.
   - Retry: G2 failed with exit code `3221226356`.
   - Direct `godot --headless --path ... --editor --quit` succeeded, and a third
     `dream verify` passed G1/G2/G3/G6.
   - The verifier currently treats the first crash as a hard G2 failure; it needs
     a bounded retry or crash classification rather than reporting a false
     project failure.

2. **The developer could call `finish` after a failed verify.**
   - Model actions were `scaffold -> verify -> finish` even though G2 failed.
   - Fixed in the tool loop: `finish` is now rejected until the latest verify has
     G1/G2/G3 all passing; the model must repair and verify again.

3. **Missing `GODOT_BIN` changes the model's behavior.**
   - With no Godot path, verify returns skip, and the model kept scaffolding and
     reading files without converging.
   - Local `.env` must include `GODOT_BIN`; the CLI now loads `.env`.
   - A future improvement should make skipped runtime an explicit environment
     error before the model starts, rather than a normal tool result.

4. **Real model behavior is still mostly scaffold/inspect.**
   - The run used `scaffold`, `verify`, `list_files`, `read_file`, then `finish`.
   - It did not call `write_file`; this test proves tool execution and gates, not
     free-form gameplay generation. A follow-up case must require a concrete
     code change (for example, change run length or add a weapon).

5. **Repeated scaffold calls are noisy and potentially destructive.**
   - The model called `scaffold` multiple times. It currently re-copies the kit
     and recomposes, which is safe for generated files but obscures the real
     development steps. The tool should warn on repeated scaffold or require an
     explicit reset.

### Result after retry

```text
G1: pass
G2: pass
G3: pass
G6: pass (1280x720, 27 colors)
```

### Second run after the finish guard

```text
Demo ready: C:\temp\gd-dev-simple · 3 steps · scaffold -> verify -> finish
G1: pass
G2: pass
G3: pass
G6: pass (1280x720, 27 colors)
```

The guard prevents an early `finish` after failed verification. This run passed
on the first verification attempt, but the model still chose only
`scaffold -> verify -> finish`; `write_file` was not exercised.

### Follow-up needed

- Add a bounded retry for Godot import crashes.
- Require a concrete modification in the simple case (for example, change the
  run target and update the HUD) so `write_file -> verify` is exercised.
- Consider treating skipped runtime as an environment error before the model
  starts, rather than letting the model loop on skipped verification.

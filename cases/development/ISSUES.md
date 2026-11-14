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

## 2026-11-13 — dash-survivor (OpenAI, actual modification)

Prompt asked for Shift dash with cooldown, HUD, and `GAMEDREAM_DASH`.

### Observed problems

1. **The model can write gameplay code, but corrupted GDScript indentation.**
   - It added `dash`, `dash_timer`, `dash_cooldown`, input action `SHIFT`,
     HUD text, and `GAMEDREAM_DASH`.
   - It wrote `_fire_bolt(weapon_level)` one indentation level too shallow under
     `"bolt":`, causing `Expected indented block after match pattern block`.
   - G2 then failed and the model spent the remaining steps reading files instead
     of applying a focused fix.

2. **Max-step exhaustion was not diagnosed.**
   - The run ended after 28 tool calls with no `finish`; the CLI reported
     incomplete but did not summarize that the project was left in a broken
     state.

3. **Repeated scaffold would overwrite useful work.**
   - `scaffold` re-copied the kit every time. Fixed: it now refuses to overwrite
     an existing `.gamedream` project unless `force:true` is passed, so a follow-up
     run can repair the existing source.

4. **No dedicated repair/resume case existed.**
   - Added `repair-dash.json` to continue from the broken project and require
     `.gamedream -> compose -> verify`.

### Repair run

`repair-dash.json` was run against the existing broken project:

```text
8 steps: scaffold(error) -> list_files -> read_file -> read_file -> write_file -> compose -> verify -> finish
```

The model fixed the bad `match` indentation, added the marker to the template,
and emitted `GAMEDREAM_DASH`. The first verify still hit the Windows G2 access
violation; a direct retry passed:

```text
G1: pass
G2: pass
G3: pass
G6: pass (1280x720, 35 colors)
```

### Follow-up needed

- Add a bounded retry for Godot import crashes; the dash repair only passed after
  a manual retry.
- Keep `repair-dash.json` as a regression case for resume/repair.
- Add a bounded retry for repeated `scaffold` and clearer max-step exhaustion
  diagnostics.
- Consider treating skipped runtime as an environment error before the model
  starts, rather than letting the model loop on skipped verification.

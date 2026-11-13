# GameDream Unity Runtime Acceptance Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Turn the verified Unity 6000.6.9f1 batchmode run into a supported CLI path: auto-detect Unity, run `EditorVerifier`, and fail on missing markers/exit codes.

**Architecture:** `@gamedream/unity` gains Unity detection and a batchmode runner. Static verification remains the default; `dream unity verify --runtime` first runs static checks, then launches `Unity.exe -batchmode -quit -projectPath ... -executeMethod EditorVerifier.Run -logFile -` and requires `UNITY_SIM_OK` + `UNITY_WIN`. No Unity binaries are bundled.

**Tech Stack:** Existing TypeScript package/CLI, Unity 6000.6.9f1 at `D:\unity\6000.6.9f1\Editor\Unity.exe`, real optional integration test.

## Global Constraints

- Runtime verification is opt-in (`--runtime`) because Unity startup is slow and needs a license.
- Static `unity verify` remains fast/works without Unity.
- Missing Unity exits 3 with guidance; marker/parse/exit failures exit 1.
- Project version accepts Unity `6000.x` (installed 6000.6), not only 6000.0.
- No Unity binaries redistributed; no changes to Godot/Web.

## Review Focus

1. Unity detection safety (env, common paths, fake/old binaries).
2. Batchmode args, timeout, marker parsing, exit-code truth.
3. CLI JSON/static+runtime composition.
4. Real 6000.6.9f1 run evidence and optional integration test.
5. Docs/version contract.

---

### Task 1: Detect + run

- Files: `packages/unity/src/detect.ts`, `runtime.ts`, index.
- Test: detection env, missing bin, marker parser.

### Task 2: CLI + real run

- Files: `packages/cli/src/commands/unity.ts`, `program.ts`.
- `unity verify --runtime [--unity path]`; JSON.
- Verify with installed Unity and generated project.

### Task 3: Docs/tests/full suite

- README/template docs, version regex, optional e2e, full test/typecheck/build.

## Evidence

- 2026-11-13, Unity `6000.6.9f1` (`D:\unity\6000.6.9f1\Editor\Unity.exe`), generated scaffold:
  - `Unity -batchmode -quit -projectPath ... -executeMethod EditorVerifier.Run -logFile -`
  - exit 0, log contained `UNITY_SIM_OK` then `UNITY_WIN`.
- `dream unity verify --path ... --runtime --unity D:\unity\6000.6.9f1\Editor`: exit 0.
- Optional `UNITY_BIN` integration test: passed in 17.5 s.

## Self-Review

- Static vs runtime, exit codes, markers, timeout, paths, installed version, CI skip.

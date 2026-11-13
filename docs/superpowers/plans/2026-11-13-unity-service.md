# GameDream Unity Service Acceptance Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Prove the built Windows player actually boots, and add a real WebGL build target with deployable static output.

**Architecture:** `SmokeRunner` (runtime, player-only) logs `UNITY_SMOKE_OK` and quits when `GAMEDREAM_SMOKE_OUT` is set; `runUnitySmoke` launches the built exe, reads its log, and requires `UNITY_BOOT_OK` + `UNITY_SMOKE_OK`. `ProjectBuilder.BuildWebGL` builds `BuildTarget.WebGL` to an output directory; CLI `unity build --target webgl` requires `UNITY_WEBGL_BUILD_OK` + `index.html`.

**Tech Stack:** Unity 6000.6.9f1 with Windows/WebGL support, existing CLI.

## Global Constraints

- Smoke must launch the actual freshly built exe; stale/missing exe or log fails.
- WebGL success requires fresh `index.html` and its `Build/` directory.
- Missing Unity exits 3; build/smoke/WebGL failures exit 1.
- `SmokeRunner` is compiled only into players, never editor.
- No Unity binaries bundled; Godot/Web unchanged.

## Review Focus

1. Player smoke truth/lifecycle and log handling.
2. WebGL target, output layout, stale file deletion.
3. CLI target routing/exit/JSON.
4. Static contract/tests/docs.
5. Long-path and missing-target behavior.

---

### Task 1: Smoke runner + CLI

- Files: `Assets/Scripts/SmokeRunner.cs`, meta, package runner, CLI.
- Build then smoke real exe.

### Task 2: WebGL builder

- Files: `ProjectBuilder.cs`, build runner target, CLI.
- Real WebGL build with index/Build.

### Task 3: Docs/tests/full suite

- README/template docs, static checks, optional integration, full suite.

## Evidence

- To be recorded after real runs.

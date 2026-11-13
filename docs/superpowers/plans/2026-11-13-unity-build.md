# GameDream Unity Deliverable Build Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Make the Unity 2D M0 scaffold produce a real Windows player, with a generated scene/build settings and an optional runtime screenshot.

**Architecture:** `ProjectBuilder` (Editor) creates `Assets/Scenes/Main.unity`, writes `EditorBuildSettings`, and builds `StandaloneWindows64` to `GAMEDREAM_BUILD_OUT`. `ScreenshotCapture` enters play mode, lets the runtime bootstrap create the arena, captures a PNG, and exits. CLI exposes `dream unity build` and `dream unity screenshot`; success requires fresh files plus `UNITY_BUILD_OK`/`UNITY_SCREENSHOT_OK`.

**Tech Stack:** Unity 6000.6.9f1 with Windows standalone support, existing C# runtime, Node CLI.

## Global Constraints

- Build/screenshot are real Unity runs; no fake success from stale files (delete output first).
- Missing Unity exits 3; build/screenshot/marker failures exit 1.
- Scene/build settings are generated, not hand-authored YAML.
- No Unity binaries bundled; Godot/Web unchanged.
- Screenshot may be best-effort in batchmode; if unsupported, report honestly and keep build deliverable.

## Review Focus

1. Fresh-output truth (stale exe/PNG cannot pass).
2. Build target availability, scene/build settings, output path.
3. Batchmode playmode screenshot lifecycle/timeout.
4. CLI detection/exit/JSON.
5. Static contract, tests, docs.

---

### Task 1: Builder + scene

- Files: `Assets/Editor/ProjectBuilder.cs`, meta, README.
- Ensure scene/settings; build Windows.

### Task 2: CLI build

- Files: package build runner, CLI commands, tests.
- Real build against installed Unity; verify exe.

### Task 3: Screenshot + full verification

- Files: `Assets/Editor/ScreenshotCapture.cs`, CLI, tests.
- Capture PNG or document limitation; suite/typecheck/build.

## Evidence

- 2026-11-13, Unity `6000.6.9f1`, generated project at `C:\temp\gd-unity-final31`:
  - `dream unity build ...` exit 0, `UNITY_BUILD_OK`, fresh
    `Builds/Windows/GameDream.exe` (667,136 bytes) + `GameDream_Data`.
  - `dream unity screenshot ...` exit 0, `UNITY_SCREENSHOT_OK`, fresh
    640×480 PNG (5,591 bytes) showing the arena, player, and enemy.
  - `Assets/Scenes/Main.unity` and `EditorBuildSettings.asset` were generated
    and are shipped in the template.
- Note: the first build attempt inside the very long Command Code scratch path
  failed in Unity's `Library` writes; short `C:\temp\...` project paths work.
  The CLI/docs call this out; build failure is not treated as success.

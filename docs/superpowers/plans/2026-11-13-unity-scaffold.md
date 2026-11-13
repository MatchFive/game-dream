# GameDream Unity 2D M0 Scaffold Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Add a Unity 6 2D M0 project scaffold that can be generated, statically verified, and run headlessly with Unity's `EditorVerifier` when Unity is installed.

**Architecture:** `@gamedream/unity` copies `templates/unity-2d-m0`, writes `GameConfig.json`, and statically verifies required files/markers. The template uses a pure C# `GameSim` plus a `RuntimeInitializeOnLoadMethod` bootstrap that builds the arena without scene assets; `Assets/Editor/EditorVerifier.cs` emits `UNITY_BOOT_OK`/`UNITY_WIN` under `-executeMethod`. CLI: `dream unity compose|verify`. No Unity binary is downloaded or bundled.

**Tech Stack:** TypeScript package + CLI, C# scripts, Unity 6 `6000.0.x`, existing test/typecheck/build.

## Global Constraints

- No Unity/Unreal binaries, licenses, or packages are redistributed.
- Static verification must not claim a Unity run; real runtime verification is documented as requiring the user's Unity 6 install.
- Generated project opens in Unity 6 without proprietary assets; M0 is a single flat arena.
- No external TS dependencies; no changes to Godot/Web runtimes.
- Compose is non-destructive unless `--force`.

## Review Focus

1. Required-file/C# marker contract and honest Unity limitation.
2. Runtime bootstrap (`RuntimeInitializeOnLoadMethod`, input, HUD, restart).
3. EditorVerifier exit/markers and batchmode command.
4. Atomic compose/force behavior, path validation.
5. Tests/typecheck/build/docs.

---

### Task 1: Package + template

- Files: `packages/unity/{package.json,tsconfig.json,src}`, `templates/unity-2d-m0`.
- C#: `GameConfig`, `GameSim`, `GameBootstrap`, `EditorVerifier`; `ProjectVersion`, `manifest.json`, `.meta` GUIDs, README.
- Test: compose files, force, config name.

### Task 2: Verifier + CLI

- Files: `packages/unity/src/verify.ts`, `packages/cli/src/commands/unity.ts`, `program.ts`.
- Test: required file, marker, malformed config, CLI help? full suite.

### Task 3: Docs/full verification

- README/architecture notes, marker contract, Unity batchmode instructions.
- `pnpm test`, `pnpm typecheck`, `pnpm build`.

## Self-Review

- Static vs runtime claim, project opens, no scene ambiguity, GUIDs, markers, CLI, tests.
- Deferred: actual Unity batchmode CI, screenshots, Unity content embedding.

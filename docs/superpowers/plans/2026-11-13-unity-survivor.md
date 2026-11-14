# Plan 56: Unity Survivor Cross-Engine Slice

## Goal

Complete the P1 cross-engine survivor slice on Unity 6 using the existing
Unity M0 verification shell.

## Implemented

- `templates/unity-survivor`: independent `SurvivorSim` (movement, auto-attack,
  crawling enemies, XP levels, boss, boss phase, 20-second survival).
- `GameBootstrap`: survivor arena, player/enemies, HUD, restart.
- `EditorVerifier`: headless survivor run with survivor markers.
- Old `GameSim`/`SaveStore` remain for the shared static verifier contract.

## Evidence

- Static verify passed.
- Runtime verify passed with Unity `6000.6.9f1`:
  `UNITY_SIM_OK, UNITY_WIN`.
- Screenshot captured; HUD is IMGUI and is not part of RenderTexture output
  (same limitation as M0).

## Limits

- Unity survivor uses primitive sprites, not the Godot SVG kit.
- Unity/Web/Godot survivor implementations still duplicate gameplay; a shared
  content/spec pack is the next architectural step.
- Not all Unity templates were migrated; this is one parity slice.

# GameDream Web Mobile + Pause Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native). Steps use checkbox syntax.

**Goal:** Make the generated Phaser game playable on touch devices and add a pause menu without changing desktop screenshots or headless markers.

**Architecture:** HTML touch controls set a parallel input state consumed by the Phaser scene; CSS hides them on fine-pointer desktops. A pause overlay stops sim stepping and offers Resume/Restart/Settings. Existing save/settings/audio/Phaser contracts stay.

**Tech Stack:** Existing HTML/CSS/Phaser/ESM; pointer events; CSS media queries.

## Global Constraints

- Desktop 1280×720 screenshot and M0/M1 markers unchanged.
- Touch controls visible for coarse pointers and narrow viewports; no external assets.
- Touch buttons set left/right/up/down/attack; toolbar opens Inventory/Quests/Settings/Pause.
- Pause stops sim updates but keeps the last frame/HUD; Resume resumes; Restart resets.
- Panel focus and touch controls must not double-trigger movement.
- No new dependencies.

## Review Focus

1. Touch input pointer lifecycle, multi-touch, focus, desktop isolation.
2. Pause state semantics vs save/audio/restart.
3. Responsive canvas/panels/controls usability.
4. Screenshot/headless/M0/M1 unchanged.
5. Tests/docs/compose contract.

---

### Task 1: Touch controls markup/CSS/input

- Files: `templates/web-m0/index.html`, `style.css`, `game.js`.
- Test: source tokens; real desktop screenshot.
- Implement: dpad/action buttons, pointer state, media query.
- Commit.

### Task 2: Pause menu + responsive layout

- Files: `index.html`, `style.css`, `game.js`, `README.md`.
- Test: pause/restart wiring; screenshot.
- Implement: pause overlay, P/touch, panel focus, responsive panel placement.
- Commit.

### Task 3: Full verification/review

- Run suite/typecheck/build; Edge screenshots; review.
- Commit.

## Self-Review

- Touch, pause, responsive, save/audio interactions, screenshots, M0/M1.
- Deferred: virtual joystick art, mobile safe-area tuning, haptics.

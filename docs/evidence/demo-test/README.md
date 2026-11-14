# Demo Test

## Offline/new-harness demo

- Case: `cases/development/p2-neon-survivor.json`
- Command: `dream develop --case ... --out D:\project\game_dream\build\p2-neon-fake --provider fake --cache-breakpoints`
- Result: `Demo ready`, exit 0, G1/G2/G3 pass.
- Screenshot: 1280x720, 62 colors (`screenshot.png`).
- This exercises the new P2 plugin tree (`readBudgetPlugin`) and cache flag.

## ComfyUI assets

- Server `http://192.168.124.56:8000`, workflow
  `D:\QQ\image_qwen_image_2_1_t2i.json`.
- Generated transparent PNGs for player, crawler, brute, and boss with
  `scripts/comfyui-generate.mjs`.
- Copied the PNGs into `.gamedream/modules/system.survivor/assets`, changed the
  preload paths, then ran `dream compose`.
- `verify` passes G1/G2/G3; `screenshot-neon.png` is 1280x720, 52 colors.
- PNG alpha at `(0,0)` is 0 (transparent), verified with System.Drawing.


## Real-provider attempt

- Command: `dream develop ... --provider openai --cache-breakpoints --max-steps 12`
- Result: G1/G2/G3 pass, 12 calls, 88.2% prompt cache; model spent all
  steps reading kit files and did not call finish (exit 2).
- Resume/new run is blocked by provider `402 insufficient_balance_error`.
  Need account balance or another OpenAI-compatible key to finish the
  model-driven variant.

## Logs

- `real-provider-12step.log`
- `real-provider-402.log`
- `offline-demo.log`
- `offline-verify.log`
- `offline-screenshot.log`

# ComfyUI Audio and Animation Plan

## Audio

MiniMax Music 3 is now fully available in the local ComfyUI instance:

- `minimax_music3_dit_int8_convrot.safetensors` in `diffusion_models`
- `minimax_music3_text_encoder_pruned_int8_convrot.safetensors` in `clip`
- `minimax_music3_dav.safetensors` in `vae`

A 30-second instrumental BGM was generated with `scripts/comfyui-audio-generate.mjs`
(seed `20261121`) and saved to
`modules/system.survivor/assets/bgm.mp3`. The survivor runtime loads it with
`AudioStreamMP3`, loops it, and prints `GAMEDREAM_BGM_OK` in windowed runs.
Headless verification skips audio playback.

Recommended asset split:

- **BGM**: MiniMax Music 3 instrumental (empty lyrics), 30–60s loops.
- **Short SFX**: procedural Godot/WebAudio for hits, pickups, UI; use an
  AI text-to-SFX model later if needed. `MireloVideoToSFX` requires a video input
  and cloud auth, so it is not the right default for UI sounds.

## Animation

No AnimateDiff loader node is installed. `/models/animatediff_models` and
`/models/animatediff_motion_lora` are empty. `WanAnimateToVideo` is installed,
but it is an image/video animation model, not an AnimateDiff sprite pipeline.

Implemented in Studio:

- **Animate** requests 2–4 transparent keyframes through the existing Qwen
  workflow, one seed per frame.
- The frames are ordinary PNG assets and are grouped into an animation canvas
  node with playback and regenerate controls.
- **Pack atlas** creates a horizontal transparent PNG with frame dimensions,
  count, FPS, and loop metadata, plus Web JSON, Godot `SpriteFrames`, and
  `index.json` under `game/build-assets/animations/`.
- The Web survivor template loads the first indexed atlas and animates the
  player; Godot template auto-wiring is pending.
- Build selection can stage the frames or atlas under `game/build-assets/`.

Still pending:

1. Wire the generated descriptors into templates automatically.
2. Evaluate AnimateDiff only after installing `ComfyUI-AnimateDiff-Evolved` and a
   motion module; video output still needs alpha cleanup and frame extraction.

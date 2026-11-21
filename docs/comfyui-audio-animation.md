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

Planned sprite path:

1. Generate transparent keyframes with the Qwen image workflow.
2. Produce a short pose/frame sequence.
3. Export PNG frames and pack a sprite sheet/atlas.
4. Evaluate AnimateDiff only after installing `ComfyUI-AnimateDiff-Evolved` and a
   motion module; video output still needs alpha cleanup and frame extraction.

Animation remains a placeholder until that pipeline is requested.

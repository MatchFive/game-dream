# ComfyUI Audio and Animation Plan

## Audio

Current ComfyUI exposes MiniMax Music 3 nodes and has:

- `minimax_music3_dit_int8_convrot.safetensors` in `diffusion_models`
- `minimax_music3_dav.safetensors` in `vae`

The text encoder is still missing from `/models/clip`:

- `minimax_music3_text_encoder_pruned_int8_convrot.safetensors`

Download that file into `ComfyUI/models/clip/`, then run:

```bash
node scripts/comfyui-audio-generate.mjs \
  --caption "Instrumental neon cyberpunk survival game loop. 92 BPM, minor key, pulsing synth bass, arpeggiated cyan lead, restrained percussion, tense but loopable." \
  --duration 30 \
  --out D:/project/game_dream/build/p2-neon-real-v2/generated-assets/bgm.mp3
```

The script preflights the three model files, builds a local MiniMax Music 3
workflow, submits it to ComfyUI, polls history, and downloads the MP3.

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

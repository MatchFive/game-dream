# ComfyUI Audio and Animation Plan

## Audio

MiniMax Music 3 is now fully available in the local ComfyUI instance:

- `minimax_music3_dit_int8_convrot.safetensors` in `diffusion_models`
- `minimax_music3_text_encoder_pruned_int8_convrot.safetensors` in `clip`
- `minimax_music3_dav.safetensors` in `vae`

A 30-second instrumental BGM was generated with `scripts/comfyui-audio-generate.mjs`
(seed `20261121`) and saved to
`modules/system.survivor/assets/bgm.mp3`.

The same path is exercised through the Studio API on 2026-11-27: a 12-second
request (`POST /api/generate {"audio": true, "duration": 12}`) returned a job
that finished in ~20 seconds and registered asset `b7f3d816649c`
(367 KB MP3), so the built-in `builtin-bgm` workflow and its
`duration`/`lyrics` bindings work end to end. The survivor runtime loads it with
`AudioStreamMP3`, loops it, and prints `GAMEDREAM_BGM_OK` in windowed runs.
Headless verification skips audio playback.

Recommended asset split:

- **BGM**: MiniMax Music 3 instrumental (empty lyrics), 30–60s loops.
- **Short SFX**: Studio generates local procedural WAV effects from 0.1–3
  seconds (`hit`, `pickup`, `ui`, `jump`, `laser`, `explosion`, `footstep`) and
  indexes them as audio assets. Each file gets a 4 ms fade-in, a 20 ms fade-out,
  DC removal, and peak normalization to −1 dBFS, so the seven types sit at the
  same level in-game and cannot click on playback. The sidecar JSON records
  `engine: "procedural"`.

### Why SFX is not model-generated yet

The same ComfyUI build ships the Stable Audio node set
(`ConditioningStableAudio`, `EmptyLatentAudio`, `VAEDecodeAudio`,
`SaveAudioAdvanced`), but no Stable Audio checkpoint is installed — the only
audio checkpoint in `diffusion_models` is MiniMax Music 3, which is a music
model and will not produce a convincing 300 ms hit. `MireloVideoToSFX` needs a
video input plus cloud auth, so it is not a default for UI sounds either.

To switch SFX to a model later, drop the workflow JSON into the workflows
directory with `kind: "audio"` and these bindings, then point the dock at it:

```json
{
  "bindings": {
    "prompt": { "node": "<text-encode>", "input": "prompt" },
    "seed": { "node": "<sampler>", "input": "seed" },
    "duration": [
      { "node": "<text-encode>", "input": "seconds_total" },
      { "node": "<latent>", "input": "seconds" }
    ],
    "output": { "node": "<save>", "output": "audio", "extension": ".flac" }
  }
}
```

Until then the Studio dock labels the SFX mode as procedural, and
`docs/evidence`/the sidecar JSON keep the distinction visible instead of
pretending the waveform came from a model.

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
  player; Godot discovers the first generated `SpriteFrames` resource.
- Build selection can stage the frames or atlas under `game/build-assets/`.

Still pending:

1. Evaluate AnimateDiff only after installing `ComfyUI-AnimateDiff-Evolved` and a
   motion module; video output still needs alpha cleanup and frame extraction.

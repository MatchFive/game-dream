# Scene artwork through the project command

2026-11-28, Windows 11, ComfyUI at `127.0.0.1:8000`, Qwen-Image 2.1 t2i workflow.

```bash
dream scene art \
  --kit packages/scene/kits/village-euro.json \
  --art dist/art-t0 \
  --workflow <api-format qwen workflow>.json \
  --only house-small
```

Output:

```
[1/1] house-small
  house-small      826181B 827x780
1 artwork files -> dist/art-t0/village-euro
manifest: dist/art-t0/village-euro.art-manifest.json
```

`house-small.png` is the generated sprite: 3/4 view, transparent background, trimmed
to the subject. The transparent background comes from the injected
`RemoveBackground → InvertMask → JoinImageWithAlpha` branch, not from the model —
without it the same workflow returns an opaque white canvas (verified: the first run
produced 1,412,265 B with `no-trim`).

`manifest-summary.json` is the recorded provenance for that single file.

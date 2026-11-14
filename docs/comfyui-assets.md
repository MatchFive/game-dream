# ComfyUI Asset Generation

GameDream can use a local ComfyUI server for transparent game sprites.

## Service

- URL: `http://192.168.124.56:8000`
- Workflow: `D:\QQ\image_qwen_image_2_1_t2i.json`
- The workflow's Qwen Image 2.1 prompt node already emits RGBA PNGs when the
  prompt starts with `This is an RGBA image with transparency.`

## Generate one sprite

```bash
node scripts/comfyui-generate.mjs \
  --server http://192.168.124.56:8000 \
  --workflow "D:/QQ/image_qwen_image_2_1_t2i.json" \
  --prompt " This is an RGBA image with transparency. Top-down game sprite of a neon cyberpunk survivor heroine, full body, centered, compact chibi proportions, no shadow, no text, no frame." \
  --out D:/project/game_dream/build/p2-neon-fake/generated-assets/player.png \
  --seed 314159
```

`--workflow` and `COMIFYUI_URL` defaults are built into the script for this
machine. It submits `/prompt`, polls `/history/<id>`, and downloads through
`/view`.

## Notes

- PowerShell 5.1 cannot parse this workflow safely because of its UTF-8 Chinese
  metadata; the Node script is required.
- The generated PNG has alpha=0 at its corner; verify with
  `System.Drawing.Bitmap.GetPixel(0,0).A`.
- Save generated assets under the project's `.gamedream/modules/.../assets`
  source, then run `dream compose`, not directly in generated `modules/`.

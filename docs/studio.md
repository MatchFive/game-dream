# Studio

`dream studio` starts a local-only web studio for project verification, asset
browsing, and game art generation. It is the first UI surface for the asset and
verification pipelines, not a cloud service.

```bash
corepack pnpm build
node packages/cli/dist/index.js studio --path . --open
```

The command prints a URL such as `http://127.0.0.1:4173`. Stop it with
`Ctrl+C`.

- `/` is the project studio: preview, verification gates, run history, session
  summary, assets, and evidence.
- `/assets` is the infinite Asset Canvas.

## Asset discovery

The studio scans the project for:

- `assets/`
- `game/assets/`
- `screenshots/`
- `modules/*/assets/`
- `docs/evidence/` images
- `.gamedream/studio/generated/`

Images (PNG, JPG, WebP, GIF, SVG) and audio (MP3, WAV, OGG, M4A) are indexed.
Canvas layout and build selections are stored in
`.gamedream/studio/canvas.json`.

## Generation

Generation uses a local ComfyUI server and the configured Qwen image workflow.
Override the defaults with:

```ini
COMFYUI_URL=http://192.168.124.56:8000
COMFYUI_WORKFLOW=D:/QQ/image_qwen_image_2_1_t2i.json
```

The **Transparent** mode adds a background-removal graph
(`LoadBackgroundRemovalModel` → `RemoveBackground` → `InvertMask` →
`JoinImageWithAlpha`) before saving the image, producing an RGBA PNG. Generated
images and prompt/seed sidecars are written to
`.gamedream/studio/generated/` and appear in the asset library.

Generation is asynchronous: the API returns one or more job ids and the UI polls
their progress. Up to four variants can be requested in one batch; each variant
gets its own seed, image, and metadata name. Jobs are in memory, so restarting
the server cancels the UI's view of an in-flight job.

## Agent

The Studio Agent panel starts the same `dream develop` loop used by the CLI as a
child process. The child writes append-only JSONL events, so the browser can
show the session transcript, tool trace, running state, and approvals without
scraping terminal output.

The CLI flags used by the Studio are:

- `--events-file <file>` writes `run/start`, session events, `tool/start`,
  `tool/end`, `approval/request`, `approval/decision`, `run/end`, and
  `run/error`.
- `--approval-dir <dir>` exchanges approval request and decision JSON files.
  The studio writes a decision when the user clicks Allow or Deny.
- `--run-id <id>` attaches the batch/run id to every event.

Each Agent batch is persisted under `.gamedream/studio/agent/<batch-id>/`.
Candidates run in separate `<candidate-N>/project` directories; applying a
candidate copies its generated top-level project files into the Studio root
while excluding `.gamedream`, `.env`, and build caches. Interrupted child
processes become failed history entries after a server restart rather than being
silently reported as running.

## HTTP API

| Route | Purpose |
|---|---|
| `GET /api/state` | Project, assets, canvas, ComfyUI status |
| `GET /api/project` | Build metadata, screenshot, verification runs, session |
| `GET /api/project/screenshot?file=...` | Serve the latest build screenshot |
| `POST /api/verify` | Spawn `dream verify` and record a durable run |
| `POST /api/upload` | Import a base64 image/audio file into `assets/uploads/` |
| `GET /api/assets/:id/raw` | Serve an indexed asset |
| `POST /api/assets/:id/use` | Mark/unmark an asset for the build (`{ "value": true }`) |
| `PUT /api/canvas` | Persist canvas nodes and build selection |
| `POST /api/generate` | Start one to four ComfyUI jobs (`{ "prompt": "...", "count": 1-4 }`) |
| `GET /api/jobs/:id` | Poll a generation job |
| `GET /api/agent` | Active/latest Agent batch and history |
| `POST /api/agent/start` | Start `dream develop` with 1–3 candidates and approval events |
| `POST /api/agent/batches/:id/cancel` | Stop the running Agent children |
| `POST /api/agent/batches/:id/runs/:runId/approval` | Allow or deny a pending tool approval |
| `POST /api/agent/batches/:id/apply` | Copy a finished candidate into the Studio project |
| `GET /api/health` | ComfyUI and workflow health |

Verification uses the same CLI entry that launched `dream studio` (or
`GAMEDREAM_CLI`). Set `GODOT_BIN` to a console executable for G2/G3.

The server binds to `127.0.0.1` by default and has no authentication. Do not
expose it on a public interface.

## Current limits

- One image per generation job; request up to four jobs per batch for variants.
- Build selection is metadata for the composer; it does not copy files into a
  module yet.
- Generated jobs are not resumed after a server restart.
- Agent children are not restarted after a server restart; they become failed
  history entries.
- Agent UI updates are file-backed polling (700ms), not a WebSocket/SSE stream.
- Candidate apply overwrites matching top-level project files without an
  automatic backup.
- Animation generation is not implemented; animation nodes remain a placeholder.

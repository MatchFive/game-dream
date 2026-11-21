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
`.gamedream/studio/canvas.json`. Display-name overrides are stored in
`.gamedream/studio/asset-names.json`; renaming an asset does not move its file
or change its id.

## Build selection

Selecting **Use in build** copies the asset to
`game/build-assets/studio/<name>-<id>.<ext>` and writes
`game/build-assets/manifest.json` with the original id, name, source, kind, MIME
type, and staged path. Unselecting removes only files listed by the previous
manifest. The composer preserves `game/build-assets/` on recompose, so staged
assets travel with the project; templates still need to reference them from
their content or sprite configuration.

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

The **Animate** chip generates 2–4 transparent keyframes with independent seeds
and creates an animation canvas node that plays the frames and can regenerate
the sequence from its prompt. Each frame is an ordinary PNG asset. **Pack
atlas** combines equal-sized frames into a horizontal transparent PNG with
`frameWidth`, `frameHeight`, `frameCount`, `fps`, and `loop` metadata; the atlas
is indexed as a normal asset and also written to
`game/build-assets/animations/` with a Web JSON descriptor and a Godot
`SpriteFrames` `.tres` resource.

The **BGM** chip generates a 30-second MiniMax Music 3 track through ComfyUI.
The job is written to `.gamedream/studio/generated/<job-id>.mp3` with a JSON
sidecar, then indexed as an audio asset that can be previewed and added to the
build. The Web survivor template reads a selected audio asset from
`game/build-assets/manifest.json`, loops it, and binds the Music slider; the
Unity survivor audio path is still pending. SFX generation and asset renaming
are not implemented yet.

## Agent

The Studio Agent panel starts the same `dream develop` loop used by the CLI as a
child process. The child writes append-only JSONL events, and the browser
subscribes to `/api/agent/events` with Server-Sent Events. Each snapshot contains
the active/latest batch, candidates, transcript events, and approvals; polling
remains as a fallback when `EventSource` is unavailable.

The CLI flags used by the Studio are:

- `--events-file <file>` writes `run/start`, session events, `tool/start`,
  `tool/end`, `approval/request`, `approval/decision`, `run/budget`, `run/end`,
  and `run/error`.
- `--approval-dir <dir>` exchanges approval request and decision JSON files.
  The studio writes a decision when the user clicks Allow or Deny.
- `--run-id <id>` attaches the batch/run id to every event.
- `--event-seq-start <n>` continues event sequencing when a persisted run is
  resumed.
- `--max-steps <n>` caps tool steps.
- `--max-tokens <n>` stops before another model call once total
  prompt + completion usage reaches the limit.
- `--max-prompt-tokens <n>` stops when cumulative prompt usage reaches the
  limit.

Each Agent batch is persisted under `.gamedream/studio/agent/<batch-id>/`.
Candidates run in separate `<candidate-N>/project` directories; applying a
candidate copies its generated top-level project files into the Studio root
while excluding `.gamedream`, `.env`, and build caches.

Starting a new batch while another is running queues it instead of rejecting the
request. The batch-level concurrency cap is one, so queued batches start FIFO
when the active batch finishes or is canceled. `/api/agent` returns `active`,
`queued`, and the persisted `batches` history; queued batches can be canceled
before they start. Candidate fan-out inside one batch still runs in parallel.

Approval policy is persisted at `.gamedream/studio/agent-policy.json`.
The Agent header's **Policy** button opens an editor listing the available Agent
tools with `allow` / `ask` / `deny` selectors and a default mode. Changes are
saved through `POST /api/agent/policy` and apply to future runs; a child process
that is already running keeps the policy it loaded. `GET /api/agent/policy`
also returns `availableTools` and `source` so the UI can show what is editable
and where the policy lives.

The approval card's **Always allow** action writes
`{ "tools": { "<tool>": "allow" } }` there and applies the current decision.
Future runs pass the file through `dream develop --permissions`; the server does
not inject the default `--ask-tool scaffold,mcp` once the policy file exists.

The Studio Agent panel accepts a maximum step count and an optional token
budget before starting a run. When total provider-reported usage reaches the
token budget, the CLI emits `run/budget`, stops before the next tool/model
action, and the run is marked **budget-exceeded** rather than finished. Finished
runs show model calls, total tokens, and cache-hit percentage from the CLI
report in both the run log and the Agent meta line.

If the Studio server restarts while a run is active, it loads the persisted
batch, expires any old pending approvals, and starts the interrupted run again
with `dream develop --resume`. The event sequence continues rather than
restarting at one. This recovery is process-level; a stale child left by a hard
crash is not reaped automatically.

## Playtest

The Studio preview has a **Play** action:

- For a generated Web project (`index.html` present), the build is served from
  `/play/` in the center pane iframe. HTML gets an injected `<base href="/play/">`;
  root-absolute `src`/`href` attributes and CSS `url()`/`@import` paths are
  rewritten under `/play/` so single-page builds do not fall back to the Studio
  routes.
- For a Godot project, the server launches the configured `GODOT_BIN` (or
  `godot`/`godot4`) in a separate window and tracks the process for Stop.
- Unity playtest is not exposed by the local server yet; the API returns 501.
- If no playable Web/Godot build is detected, the API returns 400 rather than
  opening an empty frame.

The playtest endpoint is local-only and inherits the Studio server's local
binding.

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
| `POST /api/assets/:id/rename` | Set a display name without changing the asset id or file |
| `PUT /api/canvas` | Persist canvas nodes and build selection |
| `POST /api/animation/atlas` | Pack PNG frames into an atlas + Web/Godot descriptors |
| `POST /api/generate` | Start image/animation jobs or a BGM job (`audio: true, duration: 10-60`) |
| `GET /api/jobs/:id` | Poll a generation job |
| `GET /api/agent` | Active, queued, and historical Agent batches |
| `GET /api/agent/policy` | Read the Studio approval policy, available tools, and source path |
| `POST /api/agent/policy` | Persist a tool mode (`allow`, `ask`, or `deny`) or the default mode |
| `GET /api/agent/events` | Server-Sent Events snapshots of Agent state |
| `POST /api/agent/start` | Start `dream develop` with 1–3 candidates and approval events |
| `POST /api/agent/batches/:id/cancel` | Stop the running Agent children |
| `POST /api/agent/batches/:id/runs/:runId/approval` | Allow or deny a pending tool approval |
| `GET /api/agent/batches/:id/candidates/:runId/diff` | Compare a candidate with the Studio project |
| `POST /api/agent/batches/:id/apply` | Back up touched files and copy a finished candidate into the Studio project |
| `POST /api/agent/batches/:id/rollback` | Restore the files replaced by the last candidate apply |
| `GET /api/playtest/capabilities` | Detect Web/Godot playtest availability |
| `POST /api/playtest/start` | Serve a Web iframe or launch a Godot window |
| `POST /api/playtest/stop` | Stop the launched playtest process |
| `GET /play/` | Serve the generated Web build for the Studio playtest frame |
| `GET /api/health` | ComfyUI and workflow health |

Verification uses the same CLI entry that launched `dream studio` (or
`GAMEDREAM_CLI`). Set `GODOT_BIN` to a console executable for G2/G3.

The server binds to `127.0.0.1` by default and has no authentication. Do not
expose it on a public interface.

## Current limits

- One image per generation job; request up to four jobs per batch for variants.
- Build selection stages assets under `game/build-assets/`; it does not
  automatically rewrite sprite configs or template content to reference them.
- Generated jobs are not resumed after a server restart.
- Agent children are resumed with `--resume` after a Studio restart; a child
  left behind by a hard crash is not reaped automatically.
- Agent UI uses SSE snapshots with HTTP polling as a fallback.
- Agent batches are capped at one active batch; additional submissions queue in
  memory and as persisted `batch.json` records. Candidate fan-out inside one
  batch is not capped separately.
- Token budgets are enforced only when the provider reports usage. A provider
  that returns zero or no usage cannot be hard-capped; the Studio does not
  pretend the budget was enforced. There is no currency/pricing budget yet.
- “Always allow” and the Policy editor write policy for future runs; neither
  retroactively changes the permission gate already loaded by the current child
  process.
- Policy is per tool plus a default; argument/parameter-scoped rules are not
  implemented yet.
- Candidate apply backs up only the top-level files it will touch; rollback
  removes/replaces those entries, not unrelated project files.
- Web playtest rewrites HTML/CSS asset paths and injects a base path. Runtime
  URLs constructed dynamically in JavaScript (for example `fetch('/data.json')`)
  are not rewritten; generated apps should use relative paths.
- Godot playtest requires a local display and a 4.x `GODOT_BIN`; Unity playtest
  is not available from the Studio server.
- Animation generation produces a 2–4 frame keyframe sequence with playback,
  regeneration, horizontal PNG atlas packing, and Web/Godot descriptors. There
  is no AnimateDiff node, automatic template wiring, or per-frame scaling.
- BGM generation is a fixed 30-second UI mode; SFX generation and custom
  duration are not implemented yet.

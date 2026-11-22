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

## Settings and projects

`/settings` configures the current workspace:

- Model provider/model/base URL/API key. The key is never returned by the API;
  leaving the field blank keeps the stored key.
- ComfyUI URL and Qwen workflow file, applied to new image/audio runners
  immediately after save.
- Godot and Unity executable/editor paths.

Settings are stored under the workspace at
`.gamedream/studio/settings.json`. The workspace defaults to
`GAMEDREAM_WORKSPACE`, then the parent directory of the Studio project; pass
`dream studio --workspace <dir>` to choose it explicitly.

The same page lists projects directly under the workspace whose engine can be
detected. **Create** runs `dream create` with the configured provider and opens
the new project in a separate Studio server/tab; **Open** starts another
project Studio on an ephemeral localhost port. The current project remains
untouched.

## Build bindings

Staging an asset writes `game/build-assets/bindings.json` alongside the
manifest. The first non-SFX audio becomes `bgm`, `sfx-*` assets stay in the
`sfx` list, and sprite names containing `player`/`hero` or `enemy`/`boss` map to
`player`/`enemy`. `animations` points at the generated index when present.

Web templates read the player binding and draw the image instead of the vector
fallback. Godot `SpriteService` applies the bound player/enemy texture before
content configs and prints `GAMEDREAM_SPRITE_BINDING_OK`. Unity templates copy
the same bindings into StreamingAssets and the shared `AssetBinding` replaces
the player square with the staged sprite.

Web projects use `dream web verify --visual` and write
`game/screenshots/screenshot.png`; Godot projects use `dream verify --visual`
and add the OpenAI vision review when the workspace has an API key. The visual
button records the result in the same run history as normal verification, so
the G6 status and screenshot are visible in Studio.

### Playtest

Web projects use `/play/` in an iframe. Godot projects with
`build/web/index.html` also use the iframe and embedded Web export; without a
Web export, Studio falls back to launching a native Godot window. Unity uses a
built player only.

### SFX

The Asset Canvas `SFX` chip generates a local procedural WAV without ComfyUI.
The prompt selects the type (`hit`, `pickup`, `ui`, `jump`, `laser`,
`explosion`, `footstep`) and the duration input accepts 0.1–3 seconds. Files are
indexed as generated audio assets like BGM, can be previewed, renamed, and
staged into the build. AI text-to-SFX remains a later backend option.

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
`game/build-assets/animations/` with a Web JSON descriptor, a Godot
`SpriteFrames` `.tres` resource, and an `index.json`. The Web survivor template
loads the first indexed atlas and animates the player; Godot template auto-wiring
is still pending.

The **BGM** chip generates a 30-second MiniMax Music 3 track through ComfyUI.
The job is written to `.gamedream/studio/generated/<job-id>.mp3` with a JSON
sidecar, then indexed as an audio asset that can be previewed and added to the
build. The Web survivor template reads a selected audio asset from
`game/build-assets/manifest.json`, loops it, and binds the Music slider. The
Unity survivor loads the same manifest from `Assets/StreamingAssets` after
Studio mirrors the build assets, loops the first audio track, and logs
`UNITY_BGM_OK`. SFX generation is not implemented yet.

## Agent

The Studio Agent panel starts the same `dream develop` loop used by the CLI as a
child process. The child writes append-only JSONL events, and the browser
subscribes to `/api/agent/events` with Server-Sent Events. Each snapshot contains
the active/latest batch, candidates, transcript events, and approvals; polling
remains as a fallback when `EventSource` is unavailable. Snapshots carry an SSE
`id` and `retry: 1500`, so the browser reconnects with the last event id and the
server immediately sends a fresh full snapshot.

The CLI flags used by the Studio are:

- `--events-file <file>` writes `run/start`, session events, `permission/audit`,
  `tool/start`, `tool/end`, `approval/request`, `approval/decision`,
  `run/budget`, `run/reaped`, `run/end`, and `run/error`.
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
- `--max-cost <usd>` stops before the next model/tool action once the estimated
  prompt + cached + completion cost reaches the USD limit.

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
tools with `allow` / `ask` / `deny` selectors and a default mode. It also manages
argument rules: a tool plus argument name and path prefix with a mode. The last
matching rule wins; paths outside the prefix fall back to the tool/default mode.
Changes are saved through `POST /api/agent/policy` and
`POST /api/agent/policy/rules`, and apply to future runs; a child process that
is already running keeps the policy it loaded. Every permission decision emits
`permission/audit` with tool, mode, source, rule, and allow/deny result.
`GET /api/agent/policy` also returns `availableTools` and `source`.

The approval card's **Always allow** action writes
`{ "tools": { "<tool>": "allow" } }` there and applies the current decision.
Future runs pass the file through `dream develop --permissions`; the server does
not inject the default `--ask-tool scaffold,mcp` once the policy file exists.

The Studio Agent panel accepts a maximum step count, optional token budget, and
optional USD budget before starting a run. When provider-reported usage reaches
a limit, the CLI emits `run/budget`, stops before the next tool/model action,
and the run is marked **budget-exceeded** rather than finished. Cost pricing
comes from the built-in model table or `GAMEDREAM_PRICE_PROMPT_PER_MTOK`,
`GAMEDREAM_PRICE_COMPLETION_PER_MTOK`, and `GAMEDREAM_PRICE_CACHED_PER_MTOK`;
unknown pricing fails explicitly when a cost budget is requested. Finished runs
show model calls, total tokens, cache-hit percentage, and estimated cost.

If the Studio server restarts while a run is active, it loads the persisted
batch, expires any old pending approvals, and starts the interrupted run again
with `dream develop --resume`. Before resuming, persisted child PIDs are checked;
if the process still exists and its command line contains the run id, its process
tree is killed. A reused PID whose command line does not match is never killed.
The event sequence continues rather than restarting at one.

The Agent panel shows a batch history strip with status and prompt. Selecting an
entry switches the transcript/candidates to that batch; **Clear finished** deletes
only terminal batches and their directories. Failed, canceled, and
budget-exceeded batches expose **Retry**, which starts a new batch with the same
options and a `retryOf` link while preserving the old batch/events.

## Playtest

The Studio preview has a **Play** action:

- For a generated Web project (`index.html` present), the build is served from
  `/play/` in the center pane iframe. HTML gets an injected `<base href="/play/">`;
  root-absolute `src`/`href` attributes and CSS `url()`/`@import` paths are
  rewritten under `/play/` so single-page builds do not fall back to the Studio
  routes.
- For a Godot project, the server launches the configured `GODOT_BIN` (or
  `godot`/`godot4`) in a separate window and tracks the process for Stop.
- For a Unity project, the server looks for a built player under
  `Builds/Windows/*.exe` (or `Builds`/`Build`) and launches it in a separate
  window. If no player is built, the API returns 503 instead of pretending it
  can play the project.
- If no playable Web/Godot build is detected, the API returns 400 rather than
  opening an empty frame.

The playtest endpoint is local-only and inherits the Studio server's local
binding.

## HTTP API

| Route | Purpose |
|---|---|
| `GET /api/state` | Project, assets, canvas, ComfyUI status |
| `GET /api/settings` | Workspace settings with the API key redacted |
| `POST /api/settings` | Persist model/image/engine settings and apply them |
| `GET /api/projects` | List detected projects under the workspace |
| `POST /api/projects` | Create a project via `dream create` |
| `POST /api/projects/open` | Start/open a project Studio on a new local port |
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
| `POST /api/agent/policy/rules` | Append an argument/path-prefix approval rule |
| `DELETE /api/agent/policy/rules/:index` | Delete an approval rule |
| `GET /api/agent/events` | Server-Sent Events snapshots of Agent state |
| `POST /api/agent/start` | Start `dream develop` with 1–3 candidates and approval events |
| `POST /api/agent/batches/:id/cancel` | Stop the running Agent children |
| `POST /api/agent/batches/:id/retry` | Retry failed/canceled/budget-exceeded as a linked new batch |
| `DELETE /api/agent/batches/:id` | Delete a terminal batch and its files |
| `DELETE /api/agent/batches/clear` | Delete all terminal batches |
| `POST /api/agent/batches/:id/runs/:runId/approval` | Allow or deny a pending tool approval |
| `GET /api/agent/batches/:id/candidates/:runId/diff` | Compare a candidate with the Studio project |
| `POST /api/agent/batches/:id/apply` | Back up touched files and copy a finished candidate into the Studio project |
| `POST /api/agent/batches/:id/rollback` | Restore the files replaced by the last candidate apply |
| `GET /api/playtest/capabilities` | Detect Web/Godot/Unity playtest availability |
| `POST /api/playtest/start` | Serve a Web iframe, an embedded Godot Web export, or launch a native Godot/Unity window |
| `POST /api/playtest/stop` | Stop the launched playtest process |
| `POST /api/playtest/visual` | Capture the playtest/build screen, run the engine-appropriate G6 check, and append a run |
| `GET /play/` | Serve the generated Web build for the Studio playtest frame; nested `/play/<dir>/` serves its `index.html` |
| `GET /api/health` | ComfyUI and workflow health |

Verification uses the same CLI entry that launched `dream studio` (or
`GAMEDREAM_CLI`). Set `GODOT_BIN` to a console executable for G2/G3.

The server binds to `127.0.0.1` by default and has no authentication. Do not
expose it on a public interface.

## Current limits

- One image per generation job; request up to four jobs per batch for variants.
- Studio settings are workspace-local and the API key is stored in plaintext in
  `.gamedream/studio/settings.json`; the server remains localhost-only.
- Project create uses the CLI `create` flow (automatic template/engine choice),
  not an arbitrary engine upload; opening a project starts another local Studio
  process inside the same server process.
- Build selection stages assets under `game/build-assets/` and writes
  `bindings.json`; it does not rewrite user-edited content sprite configs.
- Generated jobs are not resumed after a server restart.
- Agent children are resumed with `--resume` after a Studio restart. Persisted
  PIDs are verified against the run id before a stale process tree is reaped; a
  reused PID with a non-matching command line is left alone.
- Agent UI uses SSE snapshots with HTTP polling as a fallback.
- Agent batches are capped at one active batch; additional submissions queue in
  memory and as persisted `batch.json` records. Candidate fan-out inside one
  batch is not capped separately.
- Token/cost budgets are enforced only when the provider reports usage and
  pricing is known. Unknown pricing with a cost cap fails explicitly instead of
  pretending the budget was enforced. Pricing is table/env based, not a live
  billing feed.
- “Always allow” and the Policy editor write policy for future runs; neither
  retroactively changes the permission gate already loaded by the current child
  process.
- Policy rules are tool + argument + path-prefix scoped; there is no glob or
  arbitrary expression language.
- Candidate apply backs up only the top-level files it will touch; rollback
  removes/replaces those entries, not unrelated project files.
- Web playtest rewrites HTML/CSS asset paths and injects a base path plus a
  runtime shim for `fetch`, `XMLHttpRequest`, `URL`, image/media/script/link
  `src`/`href`, and nested `/play/<dir>/` pages. Root-absolute paths built in
  JavaScript resolve under the playtest prefix.
- Godot playtest requires a local display and a 4.x `GODOT_BIN`. Unity playtest
  requires a built player; it does not build Unity from the Studio server.
- Animation generation produces a 2–4 frame keyframe sequence with playback,
  regeneration, horizontal PNG atlas packing, and Web/Godot descriptors plus
  automatic template discovery. There is no AnimateDiff node or per-frame
  scaling.
- BGM generation is a fixed 30-second UI mode. SFX generation is a local
  procedural 0.1–3 second WAV mode; AI text-to-SFX is not implemented yet.

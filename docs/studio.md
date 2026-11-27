# Studio

`dream studio` starts a local-only web studio for project verification, asset
browsing, and game art generation. It is the first UI surface for the asset and
verification pipelines, not a cloud service.

```bash
# from the repository root
start.cmd                         # Windows
./start.sh                        # macOS/Linux
corepack pnpm start               # cross-platform

# or explicitly
node packages/cli/dist/index.js studio --path . --open
```

The command prints a URL such as `http://127.0.0.1:4173`. Stop it with
`Ctrl+C`. On Windows, `start.cmd` keeps the console open and pauses on failure;
run it from a terminal if a double-click closes immediately.

The launcher refreshes workspace dependencies when package manifests or
lockfiles are newer than the last install, or when a `workspace:*` link is
missing. It rebuilds when any workspace source is newer than the last successful
build and writes `packages/cli/dist/.gamedream-build`. Use `start.cmd --build`
to force a rebuild. If a newly added endpoint returns `unknown API route`, stop
the old Studio process and start it again; static files update immediately, but
the API server does not hot-reload.

- `/` is the project studio: preview, verification gates, run history, session
  summary, assets, and evidence.
- `/assets` is the infinite Asset Canvas.

## Frontend architecture

The Studio UI is a React 19 single-page app built with Vite, served as static
files from `packages/studio/public/app/`.

```text
packages/studio/web/          Vite + React + TypeScript
  src/pages/MissionPage.tsx   左 Agent / 中 产物验证 / 右 项目上下文
  src/pages/AssetsPage.tsx    素材库 / 画布 / 检查器 + 生成 dock
  src/pages/SettingsPage.tsx  模型、生图、引擎、Agent 扩展、项目
  src/components/Topbar.tsx   三页共用的品牌 + 导航 + 语言切换
  src/components/AgentPanel.tsx  会话流、审批、候选、策略编辑
  src/api/                    类型化 API client 与 TanStack Query hooks
  src/i18n/                   与旧页面同源的 zh/en 字典（已内置）
  src/styles/app.css          布局层；颜色与组件样式仍来自 theme.css
```

- Server data goes through TanStack Query (`refetchInterval` replaces the
  hand-written polling loops); the Agent panel subscribes to
  `/api/agent/events` over SSE and falls back to 3s polling when EventSource is
  missing.
- Interactive primitives (tabs, dialogs, tooltips) come from Radix; the visual
  system is unchanged — `theme.css`, `styles.css`, `studio.css` are still served
  from `packages/studio/public/` and styled by the same tokens as before.
- The server maps `/`, `/assets`, `/settings`, and `/studio` to
  `app/index.html`; React Router decides which page renders. `/legacy*` now
  302-redirects to the matching route, so old bookmarks keep working.
- The previous multi-page implementation (7 files, ~6100 lines of vanilla JS)
  has been deleted; `packages/studio/public/` holds only the three shared CSS
  files and the built SPA.

Development loop (backend must be running for `/api` and the shared CSS):

```bash
node packages/cli/dist/index.js studio --path . --port 6399
cd packages/studio/web && corepack pnpm dev   # http://127.0.0.1:5173
```

`corepack pnpm build` at the repository root builds the SPA too; its output is
`packages/studio/public/app/`. `scripts/start.mjs` treats `packages/studio/web`
as a build input, so editing the frontend triggers a rebuild on the next launch.

Front-end tests live next to the code (`src/**/*.test.ts[x]`) and run in the
same `pnpm test` as the rest of the repo. Pure helpers are tested directly
(`lib/gates.ts`, `lib/agent-log.ts`); components and hooks use jsdom — the agent
feed test drives a fake `EventSource` to cover both the SSE path and the 3s
polling fallback, and the approval test asserts that "always allow" writes a
policy rule instead of just approving once.

## Visual system

The three Studio pages share `theme.css`: warm off-white surfaces, ink-black
primary actions, one low-saturation olive accent, sans-serif UI text, and mono
only for paths/code/logs. Neon gradients, glows, and multi-colour status panels
are intentionally absent. Status colour is used on dots, text, and small marks
only.

The top bar is identical on all three pages: brand, breadcrumb, the
`studio-nav` segmented switcher (任务 / 素材 / 设置, English MISSION / ASSETS /
SETTINGS), then page actions. The switcher markup lives in each page but is
asserted identical by `packages/studio/test/nav.test.ts`; only `aria-current`
differs. Its style is defined once in `theme.css` — `studio.css` must not
redefine `.studio-nav`. Labels come from `studio.mission`, `studio.assets`, and
`studio.settings` in `i18n.js`, and every page carries the `data-locale-toggle`
language button.

## Settings and projects

`/settings` configures the current workspace:

- Model provider/model/base URL/API key. The key is never returned by the API;
  leaving the field blank keeps the stored key.
- ComfyUI URL, a legacy single workflow file, and an optional workflow
  directory. Workflows are reloaded for new jobs after save.
- Agent extension paths: extra skills roots and MCP config files. Project-level
  `.claude/skills` / `.commandcode/skills` / `.mcp.json` are discovered
  automatically.
- Godot and Unity executable/editor paths.
- Every file/folder field has a **浏览…** button that opens the host OS picker
  through `POST /api/dialog`; the text remains editable for remote sessions.
  Skills and MCP paths are lists with add/remove controls instead of textareas.

Settings are stored under the workspace at
`.gamedream/studio/settings.json`. The workspace defaults to
`GAMEDREAM_WORKSPACE`, then the parent directory of the Studio project; pass
`dream studio --workspace <dir>` to choose it explicitly.

The same page lists projects directly under the workspace whose engine can be
detected. **Create** runs `dream create` with the configured provider and opens
the new project in a separate Studio server/tab; an **Open existing project**
field accepts a server-side absolute path (or the folder picker) for projects
outside the workspace; it validates that the directory looks like a
GameDream/Godot/Web/Unity project. Recent paths are kept in browser storage.
**Open** starts another
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

Generation uses a local ComfyUI server. Workflows come from a registry:

- project: `<project>/.gamedream/studio/workflows/*.json`
- workspace: `<workspace>/.gamedream/studio/workflows/*.json`
- legacy single file from `COMFYUI_WORKFLOW` / settings (`legacy-qwen`)
- built-in `builtin-bgm`

Each workflow file describes its name, description, kind (`image` or `audio`),
the ComfyUI graph, and bindings:

```json
{
  "name": "Qwen Image 2.1",
  "description": "Transparent sprites, props, and concept art",
  "kind": "image",
  "workflow": { "459:471": { "class_type": "...", "inputs": {} } },
  "bindings": {
    "prompt": [{ "node": "459:471", "input": "prompt" }],
    "seed": { "node": "459:458", "input": "seed" },
    "output": { "node": "461", "output": "images", "extension": ".png" },
    "transparent": {
      "promptSuffix": ", transparent background, alpha channel",
      "nodes": {},
      "output": { "node": "461", "output": "images" }
    }
  }
}
```

The Asset Canvas workflow selector lists valid descriptors. Project
descriptors override workspace descriptors with the same id. The legacy
single-file Qwen workflow remains a fallback and keeps its transparent
background-removal graph. Generated images and prompt/seed sidecars are written
to `.gamedream/studio/generated/` and appear in the asset library.

The **Batch** chip treats each non-empty prompt line as a separate image asset
and submits one job per line. Existing 1–4 variant counts remain available when
Batch is off.

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
loads the first indexed atlas and animates the player; Godot discovers the first
generated `SpriteFrames` resource.

The **BGM** chip generates a 30-second MiniMax Music 3 track through ComfyUI.
The job is written to `.gamedream/studio/generated/<job-id>.mp3` with a JSON
sidecar, then indexed as an audio asset that can be previewed and added to the
build. The Web survivor template reads a selected audio asset from
`game/build-assets/manifest.json`, loops it, and binds the Music slider. The
Unity survivor loads the same manifest from `Assets/StreamingAssets` after
Studio mirrors the build assets, loops the first audio track, and logs
`UNITY_BGM_OK`. Local procedural SFX is available; AI text-to-SFX remains a
later backend option.

## Asset Agent

The Asset Canvas **素材 Agent** panel runs a dedicated tool-using loop over the
same model/provider settings. It can:

- `list_workflows`, `list_assets`
- `generate_asset` / `generate_batch` (image or audio)
- `pack_atlas`, `stage_asset`
- `save_workflow` into the project workflow directory
- `finish`

Runs are stored under `.gamedream/studio/asset-agent/<id>/` with
`run.json` and `events.jsonl`; the browser polls `/api/asset-agent/:id`. When a
run finishes, generated assets are indexed and automatically placed on the
canvas. The agent requires a configured model API key (the `fake` provider is
available for tests).

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

### MCP and skills

`dream develop` and the Studio Agent support multiple MCP servers and multiple
skill roots:

- MCP configs: `--mcp-config` (comma-separated), project `.mcp.json` /
  `mcp.json` / `.commandcode/mcp.json` / `.claude/mcp.json`, workspace config,
  `~/.commandcode/mcp.json`, `~/.claude.json`, and `~/.claude/mcp.json`.
  Tools are named `server/tool`; the `mcp` tool accepts
  `{ server, name, arguments }` or a `server/tool` name.
- Skills: `--skills` (comma-separated), project `.claude/skills`,
  `.commandcode/skills`, and `skills/`, plus additional roots from Settings or
  `GAMEDREAM_SKILLS_DIRS`. `SKILL.md` layouts are compatible with Claude Code
  skills.
- Settings exposes both path lists; the Agent child receives them through
  environment variables/CLI args.

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
| `GET /api/state` | Project, assets, canvas, ComfyUI status, workflows |
| `GET /api/settings` | Workspace settings with the API key redacted |
| `POST /api/settings` | Persist model/image/engine/agent-extension settings and apply them |
| `POST /api/dialog` | Open a local native file/folder picker and return `{ path }` |
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
| `POST /api/generate` | Start image/animation/BGM jobs; accepts `workflowId` |
| `GET /api/jobs/:id` | Poll a generation job |
| `GET /api/workflows` | List workflow descriptors and default image/audio ids |
| `GET /api/asset-agent` | List asset-agent runs |
| `GET /api/asset-agent/:id` | Read one run with events |
| `POST /api/asset-agent/start` | Start the asset agent with `{ prompt }` |
| `POST /api/asset-agent/:id/cancel` | Cancel a running asset agent |
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
- Generated jobs are not resumed after a server restart. Asset-agent runs are
  marked failed on restart; they are not resumed.
- Workflow descriptors are validated on read; invalid files appear in
  `/api/workflows` with `valid: false` and are not selectable.
- Batch mode creates one image asset per prompt line; it does not batch audio,
  animation, or SFX.
- Multiple MCP servers are discovered and namespaced, but a failing server is
  skipped with an entry in the registry errors; it does not block healthy
  servers. MCP transport is stdio (`command`/`args`); HTTP/SSE-only configs are
  skipped.
- Native file/folder pickers only work when the browser and Studio server are
  on the same machine; remote/LAN sessions receive a 403 and keep the manual
  path field. Linux needs `zenity` or `kdialog`.
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
- Studio write APIs reject cross-site requests (`Sec-Fetch-Site: cross-site` or
  a mismatched `Origin`) and require JSON bodies. `/play/` refuses dotfiles,
  `..`, and `node_modules`; the screenshot route only serves image files.
  Generated Web games still share the Studio origin, so playtest code can reach
  Studio APIs; moving `/play/` to a separate origin is a follow-up.
- Godot playtest requires a local display and a 4.x `GODOT_BIN`. Unity playtest
  requires a built player; it does not build Unity from the Studio server.
- Animation generation produces a 2–4 frame keyframe sequence with playback,
  regeneration, horizontal PNG atlas packing, and Web/Godot descriptors plus
  automatic template discovery. There is no AnimateDiff node or per-frame
  scaling.
- BGM generation is a fixed 30-second UI mode. SFX generation is a local
  procedural 0.1–3 second WAV mode; AI text-to-SFX is not implemented yet.

# 批次 A 安全止血设计

> 状态：Draft（待批准）
> 日期：2026-11-24
> 范围：Studio 本地 HTTP 边界、Unity 构建删除边界、Agent 技能读取边界、Studio 文件服务边界

## 1. 背景与意图

当前门禁全绿（`typecheck` / `build` exit 0，测试 256 passed / 15 skipped），但安全审计发现四个可被本机页面、同源生成游戏或模型工具触发的边界问题。批次 A 的目标是**先堵住可利用路径**，不扩展功能、不改生成内容格式。

## 2. 目标

1. 跨站请求不能调用 Studio 的写接口。
2. Windows 下配置的 Godot 路径不能通过 `shell: true` 执行任意命令。
3. Agent 只能读取 `skills/` 下已安装技能目录内的文件。
4. Studio 不能通过 `/play/` 或截图接口读取 `.env`、`.gamedream/` 等敏感文件。
5. 修复保持现有 Studio UI、CLI 和测试行为；不引入新依赖。

## 3. 非目标

- 不做完整本地鉴权、用户隔离或远程访问。
- 不把 `/play/` 迁到独立 origin。同源游戏 iframe 仍可访问 Studio API，这是已知限制，列为批次 A2。
- 不改 Unity/Godot 的构建语义，只修删除边界。
- 不修批次 B/C 的 CLI 契约、哈希校验、导出新鲜度等问题。

## 4. 方案对比

### 方案 A：分散补丁

在每个路由、每个工具、每个 spawn 点各加一段校验。

- 优点：改动小，容易逐个 review。
- 缺点：规则不一致，新增路由容易漏；测试也只能覆盖到具体点。

### 方案 B：集中信任边界 + 定向修复（推荐）

新增 `packages/studio/src/security.ts`，集中实现请求来源校验、敏感路径判断、Godot 可执行文件判断、图片扩展名判断；在 `createServer` 入口统一应用。Agent 侧新增 `resolveSkillDir` 白名单。

- 优点：一个入口、一套规则、可直接单测；后续新增路由自动受保护。
- 缺点：需要调整少量现有测试，且要确认同源浏览器请求仍然通过。

### 方案 C：完整本地鉴权 + 独立 play origin

加启动 token、所有 API 校验 token、`/play/` 迁到第二个 loopback 端口。

- 优点：能真正隔离同源生成游戏。
- 缺点：改动大，涉及 UI、CLI、测试和文档；不适合和其余安全修复混在一批。

**选择：方案 B。** 方案 C 作为批次 A2 单独立项，本批先把跨站、命令执行、越界读文件和敏感文件泄露堵住。

## 5. 设计

### 5.1 Studio 请求来源校验

新增 `security.ts`：

```ts
export function assertTrustedMutation(request: IncomingMessage): void
export function isSensitiveRelativePath(relativePath: string): boolean
export function isImageRelativePath(relativePath: string): boolean
export function isSafeGodotBin(bin: string): boolean
```

规则：

- 仅对 `POST` / `PUT` / `PATCH` / `DELETE` 生效。
- `Sec-Fetch-Site: cross-site` → 403。
- 有 `Origin` 时，解析后必须为 `http:`，且 `url.host === request.headers.host`；否则 403。
- 有请求体（`content-length > 0` 或 `transfer-encoding`）时，`content-type` 必须是 `application/json` 或 `application/*+json`；否则 415。
- 无 `Origin` 且无 `Sec-Fetch-Site` 的非浏览器客户端保持兼容（现有测试、CLI 调用不受影响）。

应用位置：`server.ts` 的 `createServer` 回调内，在 `/api/` 路由之前。

### 5.2 Godot 可执行文件

`detectGodotPlaytest` 删除 `shell: process.platform === 'win32'`，改用 `spawnSync(bin, ['--version'], ...)`。

`isSafeGodotBin`：

- 路径形态（含 `/`、`\`、盘符）必须 `existsSync` 且 `statSync().isFile()`。
- 裸命令名只允许 `^[A-Za-z0-9._-]+$`，拒绝空格、引号、`&`、`|`、`>`、`<`、`;` 等 shell 元字符。
- 不合法候选跳过，继续尝试 `godot` / `godot4`。

`/api/playtest/capabilities` 与 `/api/playtest/start` 在不可用时返回现有 503 文案，不新增错误协议。

### 5.3 Agent 技能边界

在 `packages/cli/src/commands/develop.ts` 新增：

```ts
function resolveSkillDirectory(skillsDir: string, name: string): string
```

规则：

- `name` 必须等于 `readdirSync(skillsDir, { withFileTypes: true })` 中的某个目录名。
- 拒绝空值、`.`、`..`、含 `/` 或 `\`、盘符、绝对路径。
- 返回 `join(skillsDir, name)`，并在 `read_skill` 读取前用 `realpath` 校验目标仍在技能目录内。

`scaffold` 和 `read_skill` 都改用该函数；错误信息改为 `unknown skill: <name>`。

### 5.4 Studio 文件服务

`/play/`：

- 解码后的相对路径按 `/` 和 `\` 分段；任一段以 `.` 开头或等于 `..` → 404。
- 任一段等于 `node_modules` → 404。
- 再走现有 `safeProjectFile` 与 `statSync().isFile()`。

`/api/project/screenshot?file=`：

- 有 `file` 时只允许图片扩展名：`.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`。
- 同样拒绝隐藏段和 `..`。
- 仍走 `safeProjectFile`。

不改变 `/api/assets/:id/raw`：它只服务已索引资产。

## 6. 验收标准

- 跨站 `POST /api/settings`（`Origin: http://evil.test`）返回 403，配置未写入。
- `Sec-Fetch-Site: cross-site` 的写请求返回 403。
- 同源浏览器请求（`Origin` 与 `Host` 一致）保持 200。
- 带请求体但 `content-type: text/plain` 的写请求返回 415。
- `GET /play/.env`、`GET /play/.gamedream/session.json`、`GET /play/node_modules/x` 返回 404。
- `GET /api/project/screenshot?file=.env` 返回 404；正常截图仍 200。
- Agent 传入 `skill: "../.."`、绝对路径、含分隔符的名称时返回 `unknown skill`，且不读取文件。
- 配置 `GODOT_BIN` 为含 shell 元字符的路径时，capabilities 返回不可用且不执行命令。
- `corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build` 全部通过。

## 7. 测试计划

新增 `packages/studio/test/security.test.ts`：

- `assertTrustedMutation` 的 origin / sec-fetch-site / content-type 分支。
- `isSensitiveRelativePath` 的 dotfile、dot-dir、`..`、`node_modules`。
- `isSafeGodotBin` 的路径与裸命令名。

新增 `packages/cli/test/develop-sandbox.test.ts`：

- `resolveSkillDirectory` 对合法技能、`..`、绝对路径、分隔符、不存在名称的行为。
- 通过 `developCommand` 的脚本化 provider 验证越界读取返回错误且不泄露文件内容。

扩展 `packages/studio/test/studio.test.ts`：

- `/play/.env` 404。
- 截图接口 `file=.env` 404。
- 跨站写请求 403，合法同源写请求仍成功。

## 8. 风险与回滚

- **反代/自定义 Host**：本设计只信任 `Origin.host === Host`，本地直连场景成立；反向代理场景不在支持范围，文档注明。
- **裸命令 `godot`**：去掉 shell 后依赖 Node 的 PATH 解析；若用户使用 `.cmd` shim，可能探测失败。失败时返回现有 503 和设置提示，不影响手工配置 `.exe`。
- **隐藏目录**：`/play/` 不再服务 `.well-known` 等隐藏路径；生成游戏不使用这些路径。
- 回滚方式：四个改动均为独立模块/小函数，可按文件回退，无数据迁移。

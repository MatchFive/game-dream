# ComfyUI 工作流目录、素材 Agent 与多 MCP/skills 设计

> 状态：实施中
> 日期：2026-11-26
> 范围：Studio Asset Canvas、ComfyUI 工作流注册、素材 Agent、MCP/skills 接入

## 1. 目标

1. ComfyUI 工作流不再固定单个 JSON；一个目录下每个 JSON 描述 name/description/kind/graph/bindings。
2. 素材画布支持一次生成多个不同素材；并增加真正调用工具的素材 Agent。
3. Agent 支持多个 MCP server 和多个 skills 根目录，兼容 Claude Code 的 `.claude/skills` 布局。

## 2. 工作流注册

### 2.1 目录

- 项目级：`<project>/.gamedream/studio/workflows/`
- workspace 级：`<workspace>/.gamedream/studio/workflows/`
- 设置 `image.workflowsDir` 可覆盖 workspace 级目录。
- 项目级同名 id 覆盖 workspace 级。

### 2.2 描述文件

```json
{
  "name": "Qwen Image 2.1",
  "description": "透明角色/道具/概念图",
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

- `kind`: `image` | `audio`。
- `bindings.prompt/seed/duration/lyrics` 可为单个或数组。
- `bindings.output.output`: `images` | `audio` | `files`。
- 旧 `image.workflow` 作为内置 `legacy-qwen` 保留；内置 `builtin-bgm` 保留。

### 2.3 API / UI

- `GET /api/workflows` 返回 id/name/description/kind/valid/error/default。
- `/api/state` 的 comfyui 增加 workflows/defaultWorkflow。
- `/api/generate` 接受 `workflowId`；按 kind 校验。
- Asset Canvas 增加工作流选择器；Settings 增加“工作流目录”输入。

## 3. 素材批量与 Agent

### 3.1 手动批量

- 新增“批量”模式：提示词按行拆分，每行生成一个独立素材；数量/工作流沿用当前面板。
- 与现有 1–4 变体计数共存。

### 3.2 素材 Agent

- 新增 `AssetAgentManager`，使用 `AgentLoop` + Studio 工具：
  - `list_workflows`
  - `list_assets`
  - `generate_asset`
  - `generate_batch`
  - `pack_atlas`
  - `stage_asset`
  - `save_workflow`
  - `finish`
- 事件写入 `.gamedream/studio/asset-agent/<id>/events.jsonl`，API 轮询；UI 在 `/assets` 提供 Agent 面板。
- 生成工具调用工作流注册表；保存工作流写入项目级 workflows 目录。
- fake provider 可用于测试。

## 4. 多 MCP / 多 skills

### 4.1 MCP

- 发现顺序：`--mcp-config`（可重复/逗号分隔）→ 项目 `.mcp.json` / `mcp.json` → workspace `.commandcode/mcp.json` → `~/.commandcode/mcp.json`。
- `McpRegistry` 连接多个 server；工具名 `server/tool`。
- `mcp` 工具参数 `{ server?, name, arguments }`；单 server 时 server 可省略。
- Studio Settings 增加 MCP 配置路径列表；Studio Agent 通过 env/args 传递。

### 4.2 Skills

- 根目录：`--skills`（可重复/逗号分隔）→ 项目 `.claude/skills` / `.commandcode/skills` / `skills` → workspace 同名 → `~/.claude/skills`。
- `SKILL.md` frontmatter 兼容；系统提示列出可用技能；`read_skill` 按 `root + name` 解析。
- Studio Settings 增加 skills 根目录列表；Agent 启动时传递。

## 5. 验收

- 工作流目录可列出/选择/新增；旧单文件仍可用；生成请求使用 workflowId。
- 批量模式一次创建多个节点/任务。
- 素材 Agent 能调用工具生成素材、打包图集、加入构建、保存工作流，并有事件/错误。
- 两个 MCP server 的工具都可调用；两个 skills 根目录的技能都可读。
- `typecheck` / `test` / `build` 全绿。

# GameDream 技术选型与 Agent 架构

> 状态：调研稿（2026-11）
> 目标：用 AI 以尽可能少的用户干预，完成「游戏策划 → 框架搭建 → 系统实现 → 场景/关卡 → UI → 资产 → 可玩验证 → 构建导出」的闭环，支持 2D/3D，支持 Web、Godot、Unity、Unreal。

---

## 0. TL;DR

| 决策域 | 选择 | 关键理由 |
|---|---|---|
| 主语言/运行时 | TypeScript + Node.js 22+ | MCP SDK v2 是 TS 优先；npm 分发；Web 预览与引擎工具链同栈 |
| 仓库形态 | pnpm workspace + Turborepo | 包边界清晰，适配器/技能可独立发布 |
| Agent 编排 | 自研「确定性状态机 + 任务 DAG」 | 游戏开发阶段明确，可持久化、可重放、可测试 |
| 模型接入 | Vercel AI SDK + Provider Registry | 多模型、流式、tool calling，兼容 OpenAI-compatible/本地模型 |
| 工具协议 | MCP v2（`@modelcontextprotocol/client`） | 统一接入引擎、资产、设计工具；支持 Streamable HTTP/stdio |
| 2D Web 运行时 | Phaser 4 | 完整游戏框架（tilemap/physics/camera/tween/particles），LLM 熟悉度高 |
| 3D 预览 | Three.js + glTF | 生态与模型熟悉度最好；正式 3D 仍落到目标引擎 |
| 2D 地图 | 内部 Level JSON；Tiled JSON 作为交换格式；LDtk 作为导入/创作源 | 内部格式对 AI/校验/Git 友好，外部格式生态成熟 |
| Sprite/动画 | PNG/WebP 图集 + Aseprite JSON | 开放、工具链成熟；兼容 TexturePacker JSON |
| 3D 资产 | glTF 2.0（`.glb`）为规范格式 | 开放标准，PBR/骨骼/动画完整，三引擎均可导入 |
| UI | DTCG Design Tokens + UI DSL，导出引擎原生 UI | 设计与实现解耦；多端一致；可做视觉回归 |
| 2D 骨骼动画 | Rive（runtime MIT）优先；Spine 仅在有授权时支持 | 许可友好；不把专有 runtime 打进核心 |
| 叙事 | Yarn Spinner（核心 MIT）或 Ink（MIT） | 成熟、可本地化、可测试 |
| 状态存储 | 文件即真相 + SQLite 索引/运行日志 | Git 友好、可 diff/回滚；查询与断点恢复 |
| 验证 | 构建 + headless 运行 + 截图/像素 diff + VLM 评审 + 输入回放 | 游戏必须「跑起来」而不是「看起来对」 |
| 许可证 | 代码 Apache-2.0；模板/资产分离许可 | 专利授权；避免把 GPL/专有 runtime 混入核心 |

一句话架构：**GameSpec（可校验的规格层）→ 编排器（确定性流程）→ 领域子 Agent（有限工具集）→ MCP/CLI 引擎适配 → 自动化验证闭环**。

---

## 1. 目标与非目标

### 1.1 目标

1. **快速起盘**：用户给一句想法或一份 GDD，生成可运行的项目骨架与第一个「垂直切片」。
2. **持续实现**：按里程碑实现战斗、背包、任务、存档、UI、关卡等系统，而不是一次性吐代码。
3. **场景与玩法理解**：把模糊需求转成结构化 GameSpec、系统规则、关卡布局与验收测试。
4. **少干预**：默认自动执行；只在创意方向、范围取舍、高风险操作时询问。
5. **多引擎**：同一套规格与内容，能落到 Web、Godot、Unity、Unreal。
6. **可验证**：每一步都能构建、运行、截图、回放、评审；失败可定位、可修复、可回归。

### 1.2 非目标（v0.x）

- 不做通用 IDE，不替代引擎编辑器。
- 不做「一键生成 3A」；优先保证小型 2D/轻 3D 游戏的完整可玩性。
- 不训练基础代码模型；先用前沿模型 + 评测集 + 领域技能解决。
- 不内置或再分发 Unity/Unreal/Spine 等专有二进制。
- 不做云端多人协作/托管运行时（后续可加）。

---

## 2. 生态与竞品调研

### 2.1 竞品：OpenGame

OpenGame（CUHK MMLab，Apache-2.0）是目前最接近的公开项目：

- 基于 **qwen-code**（Gemini CLI 架构的 fork）做 agent runtime。
- 核心是 **Game Skill**：`Template Skill`（选引擎/模板并脚手架）+ `Debug Skill`（在沙箱里跑、抓错误、系统性修复）。
- 配套 **GameCoder-27B**（SFT + 执行反馈 RL）与 **OpenGame-Bench**（headless browser + VLM 评审 Build Health / Visual Usability / Intent Alignment）。
- 只覆盖 **Web 2D**（Phaser/canvas/three.js 模板），不支持 Godot/Unity/Unreal。

**可借鉴**：模板技能、调试手册、执行级评测、垂直切片。
**不照搬**：fork 通用 coding agent 会背上长期维护成本，且与 Claude Code/Codex/Cursor 竞争而非互补。

### 2.2 引擎侧 MCP 现状

| 引擎 | 官方支持 | 形态 | 风险 |
|---|---|---|---|
| **Unreal 5.8+** | 内置 **Unreal MCP**（Experimental） | 编辑器内嵌 MCP server，默认 `http://127.0.0.1:8000/mcp`，仅 Streamable HTTP/SSE；Toolset Registry；默认 `tools/list` 只返回 4 个 meta-tool（`list_toolsets`/`describe_toolsets`/`describe_tools`/`call_tool`） | Experimental，API 可能变；无鉴权，仅本机 |
| **Unity 6 / Assistant 2.0** | 官方 **Unity MCP**（pre-release）+ Unity CLI/Pipeline | 编辑器内 MCP Bridge，`~/.unity/relay/` 中继进程，stdio 对 AI client，IPC 对编辑器；直接连接需用户批准 | pre-release；版本/包依赖强 |
| **Godot 4.x** | 无官方 MCP | 社区 addon：Godot Editor MCP（180+ tools）、godot-mcp-toolkit、KeeVeeG（300+ tools）、Coding-Solo 等 | 碎片化、质量参差、API 不稳定 |

**结论**：
- MCP 是统一的「工具接入契约」，但不能把核心能力完全押在某个 MCP server 上。
- 适配器必须支持 **双通道**：`MCP（优先）` + `CLI/文件生成（兜底）`。
- 对 Godot，自研一个薄 addon + 稳定工具子集，比追社区版本更可控。
- 借鉴 Unreal 的 **tool search / lazy schema**，避免几百个工具撑爆上下文。
- 借鉴 Unreal 的 **AIAccessMode（Read/Write/Execute）** 做权限分级。

### 2.3 资产生成生态

- **2D**：图像生成（OpenAI Images、Flux、SDXL、Layer/Scenario 等）、Aseprite 管线、TexturePacker 图集。
- **3D**：Meshy、Tripo 提供 text/image-to-3D、remesh、rigging、PBR、GLB/FBX 导出与 MCP/插件；Blender MCP 可做清理、重拓扑、LOD、烘焙。
- **音频**：ElevenLabs（SFX/语音）、Stable Audio、Suno（音乐）；商业条款需逐家核对。
- **UI/设计**：Figma MCP 可读取设计、变量、组件并回写画布；DTCG tokens 可直接生成多端样式。

### 2.4 差异化定位

不要做「又一个会写代码的聊天框」。做 **游戏领域的执行与验证层**：

1. **规格驱动**：GameSpec/Schema 是唯一真相，代码与资产都是它的投影。
2. **引擎无关**：一套内容模型 + 适配器，而不是为每个引擎写一套 agent。
3. **验证优先**：构建、运行、截图、回放、VLM 评审是默认动作。
4. **Bring Your Own Agent**：既能内置 agent，也能把 MCP 配置 + skills + 任务清单交给 Claude Code/Codex/Cursor 执行，再用 `dream verify` 验收。
5. **可学习的调试手册**：把「症状 → 诊断 → 已验证修复 → 回归测试」沉淀成项目内可复用技能。

---

## 3. 总体架构

### 3.1 分层

```
                         ┌──────────────────────────────┐
                         │        CLI / Studio          │
                         │ init · plan · build · play   │
                         │ verify · import · export     │
                         └──────────────┬───────────────┘
                                        │
                         ┌──────────────▼───────────────┐
                         │      Orchestrator            │
                         │ 确定性状态机 + 任务 DAG      │
                         │ 预算/重试/审批/断点恢复      │
                         └───┬──────────┬──────────┬────┘
                             │          │          │
                    ┌────────▼───┐ ┌────▼─────┐ ┌──▼─────────┐
                    │ Planner    │ │ Domain   │ │ QA /       │
                    │ Agent      │ │ Agents   │ │ Playtester │
                    └────────┬───┘ └────┬─────┘ └──┬─────────┘
                             │          │          │
                    ┌────────▼──────────▼──────────▼─────────┐
                    │              Tool Layer                │
                    │ MCP Client Manager │ FS/Shell Sandbox  │
                    │ Tool Search        │ Asset Providers   │
                    │ Access Modes       │ Code Index        │
                    └────────┬─────────────────────┬─────────┘
                             │                     │
                    ┌────────▼────────┐   ┌────────▼─────────┐
                    │ Engine Adapters │   │ Asset Pipeline   │
                    │ Web/Godot/      │   │ 2D/3D/Audio/UI   │
                    │ Unity/Unreal    │   │ normalize/import │
                    └────────┬────────┘   └────────┬─────────┘
                             │                     │
                    ┌────────▼─────────────────────▼─────────┐
                    │ Engine MCP servers / CLIs / project     │
                    │ files · headless runners · screenshots  │
                    └─────────────────────────────────────────┘
```

### 3.2 数据流

```
Prompt / GDD
   │  Intake（只问必要的 1-3 个问题）
   ▼
GameSpec (gamedream.yaml + spec/*.md)
   │  Plan
   ▼
Milestone DAG + 验收标准 (plan.yaml)
   │  Scaffold
   ▼
可运行项目骨架（引擎工程 + 模板 + 第一条垂直切片）
   │  Implement（领域子 Agent 并行/串行）
   ▼
代码 / 场景 / 数据 / UI / 资产（全部带 schema）
   │  Integrate
   ▼
可启动工程
   │  Verify（构建 → 运行 → 输入回放 → 截图 → VLM/规则）
   ▼
通过 ──► Ship（导出/构建）
失败 ──► Repair（分类 → 检索调试手册 → 最小补丁 → 回归）
```

### 3.3 设计原则

1. **Compile, don't chat**：AI 输出必须落到可校验的工件（GameSpec、JSON、代码、场景补丁），而不是停留在对话里。
2. **垂直切片优先**：先做「能玩 30 秒」的最小闭环，再横向扩系统。
3. **一切可回放**：固定随机种子、记录输入、保存运行日志与截图；失败可复现。
4. **能力可探测**：适配器声明自己支持什么；规划器只安排能力范围内的事。
5. **最小工具面**：每个子 Agent 只拿到完成任务所需的工具，降低误操作与上下文污染。
6. **渐进式披露**：技能/文档按需加载；工具 schema 懒加载。
7. **人类只做创意与风险决策**：其余默认自动。

---

## 4. 技术栈选型

### 4.1 语言与仓库

| 项 | 选择 | 说明 |
|---|---|---|
| 语言 | TypeScript（strict） | MCP SDK v2、AI SDK、Web 运行时、CLI 分发都在 TS 生态 |
| 运行时 | Node.js 22+（同时兼容 Bun） | 原生 fetch/WebSocket，MCP/CLI 生态成熟 |
| 包管理 | pnpm | 快、严格、workspace 友好 |
| 构建编排 | Turborepo | 增量构建、任务缓存 |
| 打包 | tsup / tsdown | CLI 单文件/ESM 输出 |
| 校验 | Zod + JSON Schema 导出 | 运行时校验 + 给 LLM 的 schema + 编辑器提示 |
| 测试 | Vitest | 单测/契约测试；引擎侧另用各自框架 |

**为什么不是 Python**：Python 在资产生成/ML 侧更强，但 MCP 客户端、CLI 分发、Web 预览、引擎工具桥接的综合成本更高。资产/模型侧可以用 Python 微服务或直接调 HTTP API，不必让主栈分裂。

**为什么不是 Rust**：性能不是当前瓶颈；迭代速度与生态更重要。

### 4.2 CLI / TUI

- **Commander** 做命令解析，**Ink** 做交互式 TUI（进度、任务树、日志流）。
- 命令面（暂定）：

```bash
dream init                    # 创建项目 + GameSpec 向导
dream plan                    # 生成/更新里程碑 DAG
dream build [--milestone M1]  # 执行实现
dream play                    # 启动本地预览（Web/引擎）
dream verify                  # 构建 + 运行 + 截图 + 回放 + 评审
dream repair                  # 基于最近失败进入修复循环
dream import tiled|ldtk|aseprite|gltf|figma
dream export godot|unity|unreal
dream agent export            # 生成 .mcp.json / AGENTS.md / CLAUDE.md / .cursor/rules
dream skill list|add|test     # 技能管理
```

### 4.3 Agent Runtime 与模型层

| 项 | 选择 | 理由 |
|---|---|---|
| 模型接入 | Vercel AI SDK | 统一多 provider、streaming、tool calling、结构化输出 |
| Provider | OpenAI / Anthropic / Google / OpenRouter / OpenAI-compatible / Ollama / vLLM | 用户自带 key；支持本地模型 |
| 编排 | 自研显式状态机 + 任务 DAG | 阶段固定、可持久化、可单测；避免 LangGraph 的隐式状态 |
| 结构化输出 | Zod schema + 重试/修复 | 子 Agent 必须返回 `AgentResult`，不接受自由文本 |
| 上下文管理 | 分层上下文 + 符号索引 + 技能按需加载 | 控制 token、避免 context rot |
| 预算 | 每任务 token/费用/工具调用上限 | 防止跑飞；超限转人工或降级 |

**模型路由建议**：

- 规划/架构/疑难修复：强推理模型。
- 日常编码：强代码模型（可配）。
- 分类/摘要/日志压缩：便宜小模型。
- 视觉评审/截图理解：多模态模型。
- 资产 prompt 扩写：中等模型。

**不一开始训练专用模型**。先用前沿模型 + 评测集 + 模板/技能；当评测显示稳定瓶颈（例如引擎 API 幻觉、跨文件一致性）再考虑 SFT/LoRA。

### 4.4 MCP 层

- 使用 **MCP TypeScript SDK v2**：`@modelcontextprotocol/client`、`@modelcontextprotocol/server`（v1.x 是维护线，不支持 2026-07-28 spec）。
- 传输：**stdio**（本地进程）+ **Streamable HTTP**（UE/远程）；不支持 WebSocket 的 server 不做强依赖。
- 能力：
  - server 生命周期管理（启动/健康检查/重连/版本探测）。
  - tool/resource/prompt 发现与缓存。
  - **tool search / 懒加载 schema**：默认只暴露搜索与调用入口，按需拉取完整 schema。
  - **access mode**：`read` / `write` / `execute`，映射到审批策略。
  - 工具结果规范化：文本、JSON、图片、音频、资源引用统一成 `ToolResult`。
  - 超时/取消/进度：长任务发 progress，避免客户端 120s 超时。
  - 审计：记录每次工具调用的参数、结果摘要、耗时、成本。
- 安全：MCP server 等于本机 RCE 面。默认只连 localhost；安装第三方 server 需显式确认；禁止默认 `0.0.0.0` 绑定；工具白名单/黑名单。

### 4.5 存储与状态

| 数据 | 存储 | 理由 |
|---|---|---|
| GameSpec / 关卡 / UI / 数据表 | 文件（YAML/JSON/CSV） | Git 友好、可 diff、可 review、可回滚 |
| 运行记录 / 工具调用 / 任务状态 | SQLite（better-sqlite3） | 查询、断点恢复、成本统计 |
| 资产二进制 | 文件 + 内容哈希 | 去重、缓存、可追溯 |
| 代码索引 | SQLite FTS + tree-sitter 符号表 | 轻量、无需向量库 |
| 截图/日志/构建产物 | `.gamedream/runs/<run-id>/` | 可复现、可归档 |

**不引入向量数据库**（v0.x）：项目规模有限，符号索引 + 全文检索 + 结构化工件足够；向量检索在跨项目知识库阶段再加。

### 4.6 Studio（可选本地 Web UI）

- React + Vite + Tailwind（或 shadcn/ui）。
- 功能：GameSpec 编辑、里程碑看板、资产浏览器、场景预览、运行日志、截图对比、审批队列。
- 与 CLI 共用 core；Studio 不是必需路径，CI/headless 优先。

### 4.7 测试与可观测性

| 层 | 工具 |
|---|---|
| 单元/契约 | Vitest |
| Web E2E | Playwright（截图、输入、console 捕获） |
| Godot | headless `--headless` + GUT/自研脚本 + 截图 |
| Unity | Unity Test Framework + batchmode + `-runTests` |
| Unreal | Automation Test + `UnrealEditor-Cmd.exe` + MCP 截图/日志 |
| 视觉 | 黄金截图 + pixelmatch；VLM rubric 评审 |
| 可观测 | OpenTelemetry（可选）+ 本地 JSONL trace + run 报告 |

### 4.8 许可证

- 核心代码：**Apache-2.0**（专利授权，适合基础设施）。
- 模板/示例游戏：CC0 或 MIT（便于用户商用）。
- 技能文档：CC-BY-4.0。
- 不打包：Tiled（GPL）、Spine runtime（商业授权）、Unity/Unreal 二进制。
- 资产生成：在 `assets/manifest.json` 记录 provider、model、prompt、license/terms、生成时间，便于合规审计。

---

## 5. Agent 架构

### 5.1 角色划分

| Agent | 职责 | 主要输出 | 工具范围 |
|---|---|---|---|
| **Orchestrator**（确定性） | 阶段推进、任务 DAG、预算、重试、审批、断点 | 运行状态、任务分派 | 不直接改代码 |
| **Planner** | 把 GameSpec 拆成里程碑/任务/验收标准 | `plan.yaml`、风险清单 | 只读 + 规格写入 |
| **Systems Designer** | 核心循环、系统规则、数值/经济、状态机 | `spec/systems/*.md`、数据表 | 规格/数据写入 |
| **Gameplay Coder** | 实现系统、战斗、AI、存档、输入 | 代码 + 测试 | 代码读写、运行 |
| **Level Designer** | 地图、遭遇、节奏、导航、触发器 | `levels/*.json`、场景补丁 | 地图/场景工具 |
| **UI/UX Designer** | HUD、菜单、设计令牌、可访问性、多输入 | `ui/tokens.json`、`ui/screens/*.json` | UI 工具、Figma MCP |
| **Technical Artist** | Sprite/材质/VFX/光照/导入设置 | 资产 + 导入配置 | 资产管线、引擎 MCP |
| **Integrator** | 场景/预制体/信号/资源引用接线，修跨文件问题 | 场景补丁、集成报告 | 全量写 + 引擎 MCP |
| **QA / Playtester** | 构建、回放、截图、日志、缺陷分类 | `TestReport`、缺陷单 | 只读 + 运行 + 截图 |
| **Critic（可选）** | 对玩法/视觉/可读性做评审 | 评审意见 | 只读 + 多模态 |

**关键约束**：
- 子 Agent **不共享聊天历史**，只共享结构化工件（GameSpec、任务、文件 diff、测试报告）。
- 每个子 Agent 有 **Definition of Done** 和 **输出 schema**；不达标不进入下一阶段。
- 子 Agent 只拿 **最小工具集**；Integrator/QA 才需要广权限。

### 5.2 编排状态机

```
INTAKE → PLAN → SCAFFOLD → IMPLEMENT → INTEGRATE → VERIFY
                  ↑                         │
                  └────── REPAIR ←──────────┘
                                            │
                                          SHIP
```

| 阶段 | 输入 | 输出 | 通过条件 |
|---|---|---|---|
| INTAKE | Prompt/GDD/参考 | GameSpec v0 | schema 通过；关键创意问题已确认 |
| PLAN | GameSpec | 里程碑 DAG + 验收标准 | 每个任务有 DoD/测试；依赖无环 |
| SCAFFOLD | 计划 + 引擎能力 | 可运行骨架 | 引擎能打开/启动；空场景可运行 |
| IMPLEMENT | 任务 | 代码/数据/场景/UI/资产 | 子任务 DoD；静态检查通过 |
| INTEGRATE | 所有工件 | 可启动工程 | 场景引用完整；启动无致命错误 |
| VERIFY | 工程 + 回放脚本 | TestReport | 构建/启动/核心循环/视觉/性能达标 |
| REPAIR | TestReport | 修复补丁 + 回归测试 | 失败项关闭；无回归 |
| SHIP | 通过验证的工程 | 构建产物/导出配置 | 目标平台构建成功 |

**重试策略**：同一失败最多 N 次（按失败类型）；每次必须带来新信息（新日志、新假设、新补丁）；连续失败升级为人工或缩小范围。

### 5.3 上下文与记忆

四层上下文：

1. **常驻层**：GameSpec、项目约定、引擎能力矩阵、代码风格、禁区。
2. **任务层**：当前任务相关文件（符号索引 + 依赖图检索）、接口定义、相关测试。
3. **技能层**：按需加载的 `SKILL.md`（渐进式披露），例如“Godot 场景接线”“平台跳跃手感”“UI 安全区”。
4. **失败层**：结构化错误、日志片段、截图、最近 diff、调试手册命中项。

记忆工件：

```
.gamedream/
  state.db            # 任务/运行/工具调用/成本
  runs/<id>/          # 日志、截图、构建输出、trace
  cache/              # 资产/工具结果缓存
  index/              # 代码符号与全文索引
spec/
  decisions/          # ADR（为什么这样设计）
  debug-playbook.md   # 已验证的修复模式（只追加，需回归通过）
```

**调试手册**是核心资产：每条记录包含 `症状 / 可能原因 / 诊断命令 / 已验证修复 / 回归测试 / 适用引擎版本`。这比把所有经验塞进系统提示更可控。

### 5.4 工具权限模型

| 模式 | 允许 | 典型场景 |
|---|---|---|
| `read` | 读文件、查询、截图、日志 | Planner、Critic、QA 分析 |
| `write` | 写规格/代码/数据/场景补丁 | 领域 Agent、Integrator |
| `execute` | 运行命令、启动引擎、构建 | Integrator、QA |
| `network` | 调资产 API、下载依赖 | Technical Artist |
| `purchase` | 付费资产生成 | 需显式授权 |

策略：
- 默认最小权限；`execute/network/purchase` 首次使用需确认，可按项目记住。
- 路径沙箱：只允许项目目录 + 明确配置的缓存目录。
- 命令 allowlist/denylist；禁止 `rm -rf`、强制推送、修改全局配置等。
- MCP server 分级：内置/官方/社区；社区 server 默认只读或需确认。
- 所有写操作前记录 checkpoint，支持回滚。

### 5.5 验证与修复闭环

**验证门（Gate）**：

1. **Schema Gate**：GameSpec/关卡/UI/数据表通过 Zod。
2. **Compile Gate**：TypeScript/C#/GDScript/C++ 编译或解析通过；引擎资源可导入。
3. **Boot Gate**：游戏能启动，无致命错误/缺失资源。
4. **Loop Gate**：脚本化输入能完成核心循环（移动、攻击、拾取、胜利/失败）。
5. **Visual Gate**：关键画面截图 + 像素 diff + VLM rubric（可读性、UI 遮挡、风格一致性）。
6. **Performance Gate**：帧率/内存/加载时间在预算内（可按平台配置）。
7. **Build Gate**：目标平台构建/导出成功。

**修复循环**：

```
失败 → 分类（编译/运行时/视觉/逻辑/性能/集成）
     → 检索 debug-playbook + 相关代码/日志
     → 生成最小补丁 + 回归测试
     → 重跑 Gate
     → 通过则写入 playbook（含引擎版本）
```

**关键**：修复必须附带回归测试；否则下次会被同一问题咬。

### 5.6 外部 Agent 协作（BYOA）

两种运行模式：

| 模式 | 说明 | 适合 |
|---|---|---|
| **Embedded** | `dream build` 内置 agent，一条命令跑完 | 新手、CI、无人值守 |
| **BYOA** | `dream agent export` 生成 MCP 配置 + skills + `plan.yaml` + 任务说明，交给 Claude Code/Codex/Cursor/Gemini CLI 执行；`dream verify` 验收 | 已有偏好的用户、复杂项目、团队 |

BYOA 的产物：
- `.mcp.json` / `.cursor/mcp.json` / `.codex/config.toml`（按目标）
- `AGENTS.md` / `CLAUDE.md` / `.cursor/rules/*.mdc`
- `.gamedream/skills/`（项目技能）
- `.gamedream/plan.yaml`（任务 + DoD + 验收命令）
- `.gamedream/verify.sh|ps1`（一键验证）

这样我们不需要在“通用 coding agent”上正面竞争，而是成为它的**游戏领域插件 + 验收器**。

### 5.7 失败模式与对策

| 失败模式 | 表现 | 对策 |
|---|---|---|
| 跨文件不一致 | 场景引用丢失、信号未接、类型不匹配 | 规格驱动 + 符号索引 + Integrator 专职接线 + 启动 Gate |
| 引擎 API 幻觉 | 不存在的节点/方法/属性 | 引擎版本化技能 + MCP schema + 编译/解析 Gate |
| 视觉不可用 | UI 遮挡、对比度低、画面空白 | 截图 + VLM rubric + 设计令牌 + 安全区规则 |
| 玩法不成立 | 能跑但不好玩/无目标 | 垂直切片 + 玩法验收脚本 + Critic |
| 上下文腐化 | 越改越乱 | 子 Agent 隔离 + 工件传递 + 每任务重置上下文 |
| 非确定性 | 有时能跑有时不能 | 固定随机种子 + 输入回放 + 黄金截图 |
| 成本失控 | 无限重试/大上下文 | 预算 + 失败分类 + 早停 + 小模型摘要 |
| 资产不合规 | 版权/商用限制 | manifest 记录 license/terms + provider 白名单 |

---

## 6. 引擎适配层

### 6.1 能力接口

适配器不暴露“引擎 API”，而是暴露**游戏开发能力**。规划器只依赖能力矩阵。

```ts
type EngineId = 'web' | 'godot' | 'unity' | 'unreal';

interface EngineCapabilities {
  dimensions: ('2d' | '3d')[];
  tilemap: boolean;
  spriteAnimation: boolean;
  skeletal2d: boolean;
  ui: 'html' | 'control' | 'uitoolkit' | 'umg';
  sceneGraph: boolean;
  prefabs: boolean;
  physics2d: boolean;
  physics3d: boolean;
  navigation: boolean;
  animation: boolean;
  particles: boolean;
  audio: boolean;
  buildTargets: string[];
  headlessRun: boolean;
  screenshot: boolean;
  inputInjection: boolean;
  testFramework?: string;
}

interface EngineAdapter {
  id: EngineId;
  capabilities: EngineCapabilities;

  detect(): Promise<EngineInstallation | null>;
  createProject(spec: ProjectSpec): Promise<ProjectRef>;
  openProject(ref: ProjectRef): Promise<void>;

  importAsset(ref: ProjectRef, asset: AssetRef, opts?: ImportOptions): Promise<ImportResult>;
  applyScenePatch(ref: ProjectRef, patch: ScenePatch): Promise<PatchResult>;
  applyUiPatch(ref: ProjectRef, patch: UiPatch): Promise<PatchResult>;

  run(ref: ProjectRef, opts: RunOptions): Promise<RunSession>;
  screenshot(session: RunSession): Promise<ImageRef>;
  logs(session: RunSession): Promise<LogEntry[]>;
  input(session: RunSession, events: InputEvent[]): Promise<void>;

  test(ref: ProjectRef, plan: TestPlan): Promise<TestResult>;
  build(ref: ProjectRef, target: BuildTarget): Promise<BuildResult>;
}
```

**双通道实现**：

```
EngineAdapter
  ├─ McpChannel      # 优先：官方/自研 MCP server
  └─ FileChannel     # 兜底：项目文件 + CLI + headless
```

- `McpChannel` 负责交互式编辑、场景树、运行控制、截图。
- `FileChannel` 负责可版本化的生成（代码、场景文件、配置、数据），以及 CI/无编辑器环境。
- 两者共享同一套 `ScenePatch`/`AssetRef` 中间表示，保证可测试。

### 6.2 Web 适配器（第一优先）

- 运行时：**Phaser 4**（TypeScript），Vite 构建。
- 场景/关卡：内部 Level JSON → Phaser Tilemap/自定义 loader。
- UI：HTML/CSS + 设计令牌；复杂 HUD 可用 Phaser Scene 叠加。
- 验证：Playwright 启动 dev server（或静态构建），注入输入、截图、读 console、跑断言。
- 优势：零引擎安装、CI 友好、迭代最快；作为内容模型与 Agent 流程的“试验田”。

### 6.3 Godot 适配器

- 版本：Godot 4.4+（以 4.x 稳定线为准）。
- 通道：
  - 自研薄 addon（GDScript）暴露稳定工具子集：场景树 CRUD、节点/资源属性、脚本写入 + 解析检查、信号连接、运行/停止、输入注入、截图、导出。
  - CLI 兜底：`godot --headless --path <proj> --script <tool>.gd`，`--check-only` 做脚本解析，GUT 跑测试。
- 资产：`.tscn`/`.tres` 可直接生成（文本格式，Git 友好）；glTF 原生导入；TileMapLayer + TileSet。
- 风险：社区 MCP 碎片化；因此自研 addon，不绑定某一家。

### 6.4 Unity 适配器

- 版本：Unity 6 LTS（以用户安装为准）。
- 通道：
  - 官方 Unity MCP（Assistant 2.0）优先；直接连接需用户在编辑器批准。
  - Unity CLI + Pipeline package 做安装/打开/构建/测试的自动化。
  - FileChannel：生成 C# 脚本、`.unity`/`.prefab`/`.asset` YAML、`.meta` GUID、`ProjectSettings`；用 `-batchmode -quit -executeMethod` 构建与测试。
- 资产：2D Sprite/Atlas、Tilemap、UI Toolkit（UXML/USS）或 UGUI；3D 用 glTFast 导入 `.glb`，骨骼动画优先 FBX。
- 风险：官方 MCP 仍是 pre-release；YAML/GUID 生成需严格校验；不同 Unity 版本序列化差异。

### 6.5 Unreal 适配器

- 版本：UE 5.8+（内置 Unreal MCP，Experimental）。
- 通道：
  - 内置 MCP：`http://127.0.0.1:8000/mcp`，Streamable HTTP；使用 `list_toolsets/describe_toolsets/describe_tools/call_tool` 做工具搜索；尊重 `AIAccessMode`。
  - Python 兜底：`UnrealEditor-Cmd.exe <proj> -run=pythonscript -script=<file>` 做资产生成/导入/批量修改。
  - C++/Blueprint：优先生成 Python 工具脚本与数据资产；复杂逻辑再落 C++。
- 资产：glTF 导入（Interchange）；UMG Widget Blueprint 通过 MCP/Python 生成；Niagara/Material 通过 MCP。
- 风险：Experimental API 变动；无鉴权仅本机；工具调用串行在 game thread；长任务需 progress/拆分。

### 6.6 成熟度矩阵（v0.x 规划）

| 能力 | Web | Godot | Unity | Unreal |
|---|---|---|---|---|
| 项目脚手架 | ✅ | ✅ | ✅ | ✅ |
| 2D Tilemap | ✅ | ✅ | ✅ | ⚠️ Paper2D |
| Sprite 动画 | ✅ | ✅ | ✅ | ⚠️ |
| 3D glTF | ✅ 预览 | ✅ | ✅ glTFast | ✅ Interchange |
| UI | ✅ HTML | ✅ Control | ✅ UI Toolkit | ⚠️ UMG |
| 场景树编辑 | ✅ 代码 | ✅ MCP/文件 | ⚠️ MCP/文件 | ⚠️ MCP |
| Headless 运行 | ✅ Playwright | ✅ | ✅ batchmode | ✅ |
| 截图/回放 | ✅ | ✅ | ✅ | ✅ |
| 构建导出 | ✅ Vite | ✅ | ✅ | ✅ |
| 成熟度 | 高 | 中高 | 中 | 实验 |

---

## 7. 游戏内容格式选型

### 7.1 总表

| 内容类型 | 内部规范（AI 生成/校验） | 交换/导入 | 引擎落地 | 备注 |
|---|---|---|---|---|
| 项目/玩法规格 | `gamedream.yaml` + `spec/*.md` | — | 生成项目配置 | Zod schema；人可读 |
| 世界/关卡图 | `world/world.json` | — | 关卡列表/传送点 | 图结构，含解锁条件 |
| 2D 地图 | `levels/*.level.json` | Tiled JSON/TSX、LDtk JSON | Godot TileMapLayer、Unity Tilemap、UE Paper2D | 内部 JSON 更适合 LLM；导出保证兼容 |
| TileSet | `tilesets/*.tileset.json` | Tiled TSX、LDtk defs | 引擎 TileSet/Tilemap | 含碰撞、地形、自动规则 |
| Sprite/图集 | `assets/manifest.json` + PNG/WebP | Aseprite JSON、TexturePacker JSON | Sprite/Atlas/Flipbook | 记录 pivot、9-slice、动画 tag |
| 2D 骨骼 | `assets/rigs/*.json` | Rive `.riv`、Spine `.json/.skel` | Rive/Spine runtime | 默认 Rive；Spine 需授权 |
| 3D 模型 | `assets/manifest.json` | glTF 2.0 `.glb`；FBX 兜底 | 三引擎导入 | PBR、骨骼、动画；KTX2 纹理 |
| UI | `ui/tokens.json` + `ui/screens/*.ui.json` | DTCG tokens、Figma | HTML/CSS、USS/UXML、UMG、Godot Control | 设计令牌 + 组件树 + 绑定 |
| 数据/数值 | `data/*.csv` / `*.json` | — | ScriptableObject/DataTable/Resource | CSV 便于策划编辑与 diff |
| 对话/叙事 | `dialogue/*.yarn` / `*.ink` | Yarn/Ink 编译器 | 引擎对话 runtime | 行 ID 用于本地化 |
| 任务/成就 | `data/quests.json` | — | 引擎数据资产 | 引用对话/物品/关卡 ID |
| 输入 | `input/input.yaml` | Unity Input Actions、UE Enhanced Input、Godot InputMap | 引擎输入资产 | 生成多端映射 |
| 音频 | `assets/audio/*` | OGG/WAV | 引擎 AudioSource/MetaSound | 记录循环点、响度 |
| VFX/材质 | `assets/vfx/*.json` + shader | 引擎原生 | Niagara/VFX Graph/GPUParticles | 优先参数化预设 |
| 本地化 | `loc/*.po` 或 CSV | gettext | 引擎本地化表 | key 稳定、可增量 |
| 存档 | `save/schema.json` | — | JSON + 迁移 | 版本号 + migrate 函数 |
| 测试 | `tests/playtests/*.yaml` | — | Playwright/引擎测试 | 输入序列 + 断言 |
| 构建 | `build/targets.yaml` | — | 引擎 CLI | 平台/配置/签名 |

### 7.2 Tilemap / Map

**内部 Level JSON**（示意）：

```json
{
  "id": "level-01",
  "title": "Forest Entrance",
  "size": { "w": 64, "h": 32, "tile": 16 },
  "tilesets": [{ "id": "terrain", "src": "tilesets/terrain.tileset.json" }],
  "layers": [
    { "type": "tile", "name": "ground", "data": [0, 1, 2, 3] },
    { "type": "tile", "name": "walls", "data": [0, 0, 5, 5] },
    { "type": "object", "name": "entities", "objects": [
      { "type": "player_spawn", "x": 3, "y": 4 },
      { "type": "enemy", "x": 20, "y": 10, "props": { "kind": "slime" } }
    ] },
    { "type": "trigger", "name": "boss_gate", "rect": [50, 4, 8, 2], "on": "enter", "action": "spawn_boss" }
  ],
  "meta": { "biome": "forest", "music": "forest_01", "difficulty": 1 }
}
```

**选型理由**：
- 行式 tile 数据紧凑，LLM 生成/修改成本低。
- 对象层/触发器独立，便于玩法接线。
- 通过 `import/export` 与 Tiled/LDtk 互转；不把 TMX 作为内部格式（XML 冗长、易错）。
- Tiled：兼容性最好、正交/等距/六边形都支持；编辑器 GPL，但格式开放，核心不打包编辑器。
- LDtk：MIT、实体驱动、世界/多关卡、自动层；适合快速创作；可导出 TMX。
- 引擎侧：Godot `TileMapLayer` + `TileSet`；Unity `Tilemap` + `RuleTile`；UE `Paper2D TileMap`（2D）或 3D 网格。

### 7.3 Sprite / Animation

**图集清单**：

```json
{
  "id": "hero",
  "image": "hero.png",
  "frameSize": { "w": 32, "h": 32 },
  "pivot": [0.5, 0.9],
  "animations": {
    "idle": { "frames": [0, 1, 2, 3], "fps": 8, "loop": true },
    "run":  { "frames": [4, 5, 6, 7], "fps": 12, "loop": true },
    "attack": { "frames": [8, 9, 10], "fps": 16, "loop": false, "events": { "2": "hit" } }
  },
  "nineSlice": null
}
```

- 规范：PNG/WebP + Aseprite JSON（`frames`/`frameTags`/`durations`/`slices`）；兼容 TexturePacker JSON Hash/Array。
- 像素风：关闭过滤、整数缩放、`pixelArt: true`（Phaser）、Godot `texture_filter=Nearest`、Unity `Filter Mode=Point`。
- 动画事件（攻击判定、脚步声）用帧事件表达，导出到引擎 Animation Event/信号。
- 9-slice UI 用 `nineSlice` 元数据；引擎侧生成 Sprite/九宫格。

### 7.4 UI

**设计令牌（DTCG 兼容）**：

```json
{
  "color": {
    "bg": { "$value": "#101418", "$type": "color" },
    "text": { "$value": "#E8EDF2", "$type": "color" },
    "accent": { "$value": "#5AD1A0", "$type": "color" }
  },
  "space": { "sm": { "$value": "4px", "$type": "dimension" } },
  "radius": { "md": { "$value": "8px", "$type": "dimension" } },
  "font": { "body": { "$value": "Inter", "$type": "fontFamily" } }
}
```

**UI DSL**（示意）：

```json
{
  "screen": "hud",
  "root": {
    "type": "stack",
    "direction": "vertical",
    "anchor": "top-left",
    "safeArea": true,
    "children": [
      { "type": "bar", "bind": "player.hp", "max": "player.maxHp", "style": "hp" },
      { "type": "text", "bind": "player.name", "style": "body" },
      { "type": "button", "label": "Pause", "action": "pause", "input": ["key:Escape", "pad:Start"] }
    ]
  }
}
```

**导出目标**：

| 平台 | 落地 |
|---|---|
| Web | HTML/CSS（CSS 变量来自 tokens） |
| Godot | `Control` 节点树 `.tscn` + Theme |
| Unity | UI Toolkit `UXML`/`USS`；或 UGUI Prefab |
| Unreal | UMG Widget Blueprint（MCP/Python） |

**规则**：
- 所有交互元素必须有键盘/手柄/触屏映射。
- 安全区、最小字号、对比度（WCAG）作为 Gate。
- 设计令牌是唯一颜色/间距来源；禁止硬编码。
- Figma 作为可选设计源：Figma MCP 读变量/组件 → DTCG tokens + UI DSL。

### 7.5 3D

- **规范格式**：glTF 2.0（`.glb`），PBR metallic-roughness，骨骼/蒙皮/动画内嵌。
- **纹理**：PNG/JPEG 源，运行时优先 KTX2/Basis（压缩、显存友好）。
- **生成**：Meshy/Tripo API（text/image-to-3D）→ GLB → Blender headless/MCP 清理（重拓扑、LOD、法线、碰撞）→ 导入引擎。
- **兜底**：FBX（Unity/Unreal 原生；Godot 需 FBX2glTF）；USD 仅在有预演/影视管线需求时。
- **材质**：glTF 材质 → 引擎材质实例；复杂材质用引擎原生（UE Material、Unity Shader Graph、Godot Shader）。
- **碰撞**：生成简化碰撞体（box/capsule/convex），不直接用高模。
- **预算**：三角面、贴图尺寸、骨骼数、材质槽、LOD 数量作为资产 Gate。

### 7.6 音频

- 格式：OGG Vorbis（音乐/长音效）、WAV（短音效/需要精确同步）。
- 元数据：循环点、响度（LUFS）、总线、随机变体、并发限制。
- 中间件：FMOD/Wwise 作为可选适配器（专有，不打包）。
- 生成：ElevenLabs（SFX/语音）、Stable Audio、Suno（音乐）；记录商用条款。
- 引擎落地：Unity AudioSource/Mixer、UE MetaSound/SoundCue、Godot AudioStreamPlayer。

### 7.7 数据、叙事、本地化

- **数据表**：CSV 为主（策划友好、diff 清晰），构建时转 JSON/引擎资产；用 Zod 校验列类型与引用完整性。
- **叙事**：Yarn Spinner（核心 MIT；注意新产品的 YSPL 对 AI 训练/竞品再包装有限制）或 Ink（MIT）。对话行带稳定 ID，便于本地化与测试。
- **本地化**：gettext PO 或 CSV；key = `dialogue.<file>.<lineId>` / `ui.<screen>.<key>`；禁止把文案硬编码在代码里。
- **引用完整性**：物品/敌人/关卡/对话/音频 ID 全局注册表；构建时检查悬空引用。

### 7.8 项目目录

```
my-game/
  gamedream.yaml
  spec/
    pillars.md
    loop.md
    systems/
    decisions/
    debug-playbook.md
  world/
    world.json
  levels/
    level-01.level.json
  tilesets/
    terrain.tileset.json
  assets/
    manifest.json
    sprites/
    models/
    audio/
    vfx/
  ui/
    tokens.json
    screens/
  data/
    enemies.csv
    items.csv
    quests.json
  dialogue/
  input/
    input.yaml
  loc/
  tests/
    playtests/
  .gamedream/
    state.db
    runs/
    cache/
    index/
    skills/
```

### 7.9 GameSpec 示例

```yaml
version: 1
project:
  name: "Ember Forest"
  engine: web            # web | godot | unity | unreal
  dimension: 2d
  resolution: [1280, 720]
  target: [web]

vision:
  genre: action-platformer
  fantasy: "在会燃烧的森林里，用余烬点亮路径并击退腐化生物"
  pillars:
    - "风险与回报：余烬既是光源也是弹药"
    - "短促的关卡节奏：每关 3-5 分钟"
  references: ["Hollow Knight", "Celeste"]

loop:
  moment: "移动/跳跃/冲刺/投掷余烬"
  session: "进入关卡 → 探索 → 战斗 → 点亮信标 → Boss/出口"
  progression: "解锁冲刺 → 解锁二段跳 → 新区域"

scope:
  levels: 3
  enemies: 4
  bosses: 1
  playtime_minutes: 20

systems:
  - id: movement
    notes: "土狼时间 0.1s；跳跃缓冲 0.1s；冲刺无敌 0.12s"
  - id: ember
    notes: "投掷消耗 1 余烬；命中恢复 0.5；光照半径随余烬数变化"
  - id: combat
    notes: "3 段连击；受击硬直 0.2s；击退"

acceptance:
  - "玩家能在 10 秒内完成移动/跳跃/攻击"
  - "第一关有明确的起点、路径、终点"
  - "HP 归零进入失败界面，可重开"
  - "稳定 60fps @1280x720"
```

---

## 8. MVP 范围与路线图

### 8.1 v0.1 垂直切片（先证明闭环）

- 引擎：Web 2D（Phaser 4）。
- 输入：一句 Prompt / GameSpec。
- 输出：可运行的小游戏（1 关、1 种敌人、移动/攻击/血量/胜负/重开）。
- Agent：Planner + Gameplay Coder + UI + Integrator + QA。
- 验证：Playwright 启动、输入回放、截图、console 断言、VLM 评审。
- 资产：占位图 + 可选图像生成；Aseprite JSON 导入。
- 内容：内部 Level JSON、tokens + UI DSL、CSV 数据表。

**验收标准**：从空目录到可玩，用户只需回答 ≤3 个创意问题；失败时能自动修复至少 1 轮。

### 8.2 阶段

| 阶段 | 内容 | 退出条件 |
|---|---|---|
| **M0 基础** | monorepo、schemas、MCP client、capability 接口、CLI `init/plan/verify`、Web 适配器、Phaser 模板 | 空目录 → 可玩垂直切片；CI 通过 |
| **M1 2D 内容** | Tiled/LDtk 导入导出、Aseprite 图集、UI DSL、输入回放 DSL、调试手册 | 能改关卡/UI/动画并回归 |
| **M2 引擎** | Godot addon + 适配器；Unity 适配器（官方 MCP + CLI + 文件兜底）；UE 适配器（内置 MCP + Python 兜底） | 每个引擎至少完成「脚手架 + 运行 + 截图 + 构建」 |
| **M3 3D/Studio** | glTF 管线、Three.js 预览、Meshy/Tripo 接入、Studio UI、技能市场、评测集 | 3D 垂直切片 + 可视化工作台 |
| **M4 规模化** | 多关卡/多系统、性能预算、BYOA 配置导出、Benchmark | 外部用户可复现产出 |

> 不在这里给时间估算；按阶段退出条件推进。

### 8.3 建议的首批 Skills

| Skill | 内容 |
|---|---|
| `game-design` | MDA、核心循环、玩家幻想、范围控制、GDD 模板、验收标准 |
| `level-design` | 布局、节奏、遭遇、导航、可读性、关卡验收 |
| `game-ui` | HUD/菜单、设计令牌、安全区、可访问性、多输入、引擎映射 |
| `gameplay-systems` | 状态机、战斗、背包、存档、输入、AI 行为 |
| `art-direction` | 风格圣经、调色板、Sprite 规格、资产生成 prompt、一致性 |
| `audio-direction` | SFX/音乐方向、响度、循环、实现 |
| `qa-playtest` | 测试计划、回放脚本、缺陷分类、性能预算 |
| `engine-web` | Phaser 4 约定、场景/资源/输入/测试 |
| `engine-godot` | 场景树、信号、TileMapLayer、资源、headless |
| `engine-unity` | 目录约定、UI Toolkit、YAML/GUID、batchmode |
| `engine-unreal` | Toolset Registry、MCP 工具搜索、Python、UMG/Blueprint |

技能格式：`SKILL.md`（frontmatter: name/description）+ `references/` + `scripts/` + `assets/`；渐进式披露；与 Claude Code/Codex/Command Code 兼容；每个技能配 2-3 个 eval prompt。

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 引擎 MCP 不稳定/变更 | 适配器频繁坏 | 版本固定 + 契约测试 + FileChannel 兜底 + 能力探测 |
| Unity/UE 序列化格式复杂 | 生成文件打不开 | 优先生成最小差异；用引擎自身保存；严格 schema 校验；GUID 管理 |
| Godot MCP 碎片化 | 选错依赖 | 自研薄 addon；只依赖稳定 API；社区方案仅作参考 |
| 模型幻觉引擎 API | 编译失败/运行崩溃 | 版本化技能 + MCP schema + 解析/编译 Gate + 检索真实项目代码 |
| 跨文件一致性 | 场景/信号/引用断裂 | GameSpec + 全局 ID 注册表 + Integrator + Boot Gate |
| 视觉质量差 | “能跑但不可用” | 设计令牌 + 截图/VLM Gate + 参考图 + 风格约束 |
| 玩法不成立 | 没有目标/反馈 | 垂直切片 + 玩法验收脚本 + Critic + 早期人工试玩 |
| 成本/延迟 | 跑飞 | 预算、模型路由、缓存、失败早停、小模型摘要 |
| 安全（MCP=本机 RCE） | 任意命令执行 | localhost only、安装确认、工具白名单、权限分级、沙箱、审计 |
| 许可合规 | 法律风险 | 不打包 GPL/专有 runtime；资产 manifest 记录条款；生成内容人工复核 |
| 范围膨胀 | 项目做不完 | 内容预算（关卡/敌人/时长）+ 明确非目标 + 阶段退出条件 |

---

## 10. 待决问题

1. **首发引擎**：Web 2D 单点打透，还是 Web + Godot 双引擎并行？（建议 M0 Web，M2 Godot；Unity/UE 先做“能跑通”的适配器）
2. **是否自研模型**：先建评测集与失败分类；只有稳定瓶颈才考虑 SFT/LoRA，不做基座训练。
3. **3D 首发范围**：glTF 资产管线 + Three.js 预览优先；UE/Unity 3D 场景编辑后置。
4. **Studio 优先级**：CLI/CI 优先；Studio 在 M1 后做最小可用（规格编辑 + 运行 + 截图）。
5. **技能生态**：先内置 10 个高质量技能，再开放社区；需要技能测试框架与版本兼容策略。
6. **商业模式**：核心开源 + 托管资产生成/团队协作/私有技能市场？（不影响 v0.x 架构）

---

## 11. 参考来源

- [OpenGame: Open Agentic Coding for Games](https://github.com/leigest519/OpenGame)
- [OpenGame arXiv](https://arxiv.org/abs/2604.18394)
- [Unreal MCP in Unreal Editor](https://dev.epicgames.com/documentation/unreal-engine/unreal-mcp-in-unreal-editor?lang=en-US)
- [Unity MCP overview](https://docs.unity3d.com/Packages/com.unity.ai.assistant@2.0/manual/unity-mcp-overview.html)
- [Unity CLI](https://docs.unity.com/en-us/unity-cli)
- [MCP TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/)
- [MCP TypeScript SDK (GitHub)](https://github.com/modelcontextprotocol/typescript-sdk)
- [CoplayDev/unity-mcp](https://github.com/CoplayDev/unity-mcp)
- [Godot Editor MCP](https://godotengine.org/asset-library/asset/5434)
- [godot-mcp-toolkit](https://github.com/NPGameDev/godot-mcp-toolkit)
- [LDtk](https://ldtk.io/docs/)
- [LDtk TMX export](https://ldtk.io/docs/game-dev/exporting-tiled-tmx/)
- [Tiled vs LDtk](https://egmatic.com/blog/tiled-vs-ldtk)
- [Aseprite JSON format](https://kistepix.com/en/aseprite-json-format/)
- [Aseprite spritesheet data format](https://www.aseprite.org/api/spritesheetdataformat)
- [glTF support in Unreal](https://dev.epicgames.com/documentation/unreal-engine/gltf-file-format-support-in-unreal-engine?lang=en-US)
- [Rive runtimes](https://rive.app/runtimes)
- [Spine runtimes](https://github.com/EsotericSoftware/spine-runtimes)
- [Yarn Spinner license](https://github.com/YarnSpinnerTool/YarnSpinner/blob/main/LICENSE.md)
- [Figma MCP server guide](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
- [Meshy API](https://www.meshy.ai/api)
- [Tripo AI game asset API](https://www.tripo3d.ai/blog/best-ai-game-asset-api)
- [Phaser vs PixiJS 2026](https://aigamingdev.com/blog/phaser-pixijs-threejs-comparison/)
- [W3C DTCG design tokens](https://uxhero.design/blog/w3c-dtcg-token-architecture)

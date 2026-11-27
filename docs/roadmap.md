# GameDream 后续开发路线图

> 基线：`master`（2026-11-21，A1 完成后）  
> 范围：CLI、Agent runtime、Studio、引擎适配、资产管线、模板内容与发布验证  
> 状态标记：**Done** / **Next** / **Backlog** / **Blocked**

## 1. 当前基线

以下能力已经实现并有测试或审计证据，不再作为待做项重复规划。

| 领域 | 已完成 |
|---|---|
| Agent runtime | 结构化事件、工具轨迹、审批、候选 A/B/C、`--resume`、持久化 batch、服务重启自动恢复、SSE 推送、token 硬预算停止、批次队列 |
| Studio Agent | 实时会话、流式 chunk、审批卡、Always allow 策略、候选 diff、应用前备份、回滚、最大步数、token 预算、usage 展示、排队/取消排队、按工具审批编辑器 |
| Studio 项目页 | 构建截图、G1–G3 闸门、验证运行历史、素材/证据/会话摘要 |
| Studio 配置/项目 | workspace 模型/生图/引擎设置、密钥不回显、项目列表/创建、独立子 Studio 打开 |
| Asset Canvas | 无限画布、真实素材索引、上传、Inspector、构建选择、真实 ComfyUI 1–4 变体生成、透明 PNG、2–4 帧动画序列、PNG 图集 |
| Playtest | Web `/play/` iframe、Godot 外部窗口启动/停止、能力探测 |
| CI | MCP fixture smoke、真实 Godot 4.4.1 runtime smoke、Windows `test-windows` job（含中文路径冒烟）、typecheck/build/full tests |
| 文件复制 | 统一 `copyPath`，不受 Windows 非 ASCII 路径影响（`fs.cpSync` 会 ENOENT 或段错误） |
| UI | 中文默认、中英切换、桌面/移动布局 |

当前验证基线：

- `pnpm typecheck` / `pnpm build`：exit `0`
- 全量测试：**308 passed / 15 skipped**
- Agent focused tests：**20 passed**
- 真实 Godot runtime：`G1=pass`、`G2=pass`、`G3=pass`、`engine=present`
- 真实 Unity 6000.6.9f1：EditorVerifier、Windows build、runtime smoke、截图、BGM smoke **4/4 pass**
- Agent smoke：`finished=true`、`score=1400`、`AGENT_APPROVAL_FLOW_OK=1`

证据位置：

- `docs/evidence/agent-loop/`
- `docs/evidence/runtime/godot-runtime.log`
- `docs/evidence/windows-paths/`
- `docs/studio.md`
- `docs/ci.md`

## 2. 开发原则

1. **先闭环，再扩展**：优先完成能被执行、验证、回滚的链路。
2. **真实验证优先**：不以静态 mock 或“看起来能跑”代替 engine/runtime gate。
3. **失败可见**：Agent 和验证失败必须显式失败，不伪造 pass。
4. **可回滚**：涉及项目文件写入的自动化必须有备份、diff 或恢复路径。
5. **本地优先**：Studio 默认只绑定 localhost；远端部署前必须补鉴权。
6. **复用优先**：共享 runtime、adapter、模板和测试夹具，避免每个模板重复生成。

## 3. 路线图总览

| 阶段 | 目标 | 主要产出 | 状态 |
|---|---|---|---|
| M0 | 跨平台正确性 | 统一复制实现、Windows CI job、中文路径回归 | Done |
| M1 | Agent 运行生产化 | 硬预算、费用预算、队列、策略编辑/参数规则、崩溃回收、历史、重试 | Done |
| M2 | 验证与试玩闭环 | 真实 playtest、Unity runtime、G6 集成 | Done |
| M3 | 资产管线完整化 | 动画序列、音频 UI、SFX、构建素材落地 | In progress |
| M4 | 游戏内容深度 | survivor/roguelike/模板内容提升 | Backlog |
| M5 | 平台扩展 | Unity/Unreal/3D/协作 | Backlog |

## 4. P0 · Agent 运行生产化

| ID | 事项 | 当前缺口 | 验收标准 | 状态 |
|---|---|---|---|---|
| A1 | Token 硬预算 | 已实现总 token 和 prompt token 停止；provider 不返回 usage 时无法约束 | 达预算前停止、`run/budget` 事件、`budget-exceeded` 状态、CLI/Studio 测试 | Done |
| A1b | 费用/金额预算 | 已支持模型价格表/环境覆盖、`--max-cost`、成本停止与 usage 展示；未知价格显式失败 | 按价格估算成本，达到预算前停止；未知价格显式标记 | Done |
| A2 | Agent 队列与并发 | 已支持 FIFO 批次队列、取消排队、自动接续；批级别并发上限为 1 | 连续提交不阻塞、queued 状态进入 SSE/UI、取消队列、当前批次结束后自动启动下一项 | Done |
| A3 | 审批策略编辑器 | 已支持按工具和默认模式的 allow/ask/deny 编辑、来源展示 | 可按工具编辑、保存到 policy 文件、来源可见、未来 run 生效 | Done |
| A3b | 参数级审批规则 | 已支持工具 + arg + path prefix 匹配；最后匹配规则优先；越界回退到工具/默认；`permission/audit` 事件 | 参数/路径规则、越界 ask/deny、审计记录 | Done |
| A4 | 硬崩溃子进程回收 | 已持久化 PID，重启时校验命令行包含 run id 后再 tree-kill；不匹配的 PID 不杀 | 安全回收 stale child，PID 复用不误杀 | Done |
| A5 | 运行历史 UI | 已显示历史批次、切换查看、清理已结束批次 | 历史列表、切换查看、清理旧 batch | Done |
| A6 | Agent 失败重试 | 已支持 failed/canceled/budget-exceeded 批次重试，新批次带 `retryOf`，旧批次与事件保留 | 失败后重试、保留旧事件、明确新 generation | Done |

### A1 预算语义

- `maxSteps` 限制工具/模型步数，不限制成本。
- `maxTokens` 在累计 `prompt + completion` 达到上限后、下一次工具/模型动作前停止。
- `maxPromptTokens` 在累计 prompt token 达到上限后停止。
- `maxCostUsd` 按 prompt/cached/completion 单价估算美元，达到上限后停止；价格来自模型表或 `GAMEDREAM_PRICE_*_PER_MTOK` 覆盖。
- 未知价格时设置费用预算会显式失败，不用 0 成本假装预算生效。
- 触发时写入 `run/budget`，报告 `budgetExceeded`，Studio 状态为 `budget-exceeded`。
- 不把未返回 usage 的 provider 当作“预算已生效”。

## 5. P0 · 验证与试玩

| ID | 事项 | 当前缺口 | 验收标准 | 状态 |
|---|---|---|---|---|
| V1 | Unity runtime/playtest | 真实 Unity 6000.6.9f1 已通过 EditorVerifier、build、smoke、截图；Studio 可启动已构建 player | 真实 build/runtime/screenshot，Studio 有构建时才播放 | Done |
| V1b | Unity runtime CI | 已加可选 `unity-runtime` self-hosted job；仓库变量缺失时 skip | 可选 self-hosted job，缺 Unity 时明确 skip | Done |
| V2 | Godot 内嵌试玩 | 已支持 `build/web/index.html` 存在时用 `/play/` iframe 内嵌；无 Web export 时回退独立窗口 | 可行时提供内嵌/自动关闭和运行日志回传 | Done |
| V3 | Web 绝对路径兼容 | 已注入 `/play/` base 并重写 HTML/CSS 根路径；JS 动态路径由 V3b runtime shim 处理 | HTML/CSS 绝对资源正确加载；相对路径构建不受影响；测试覆盖 | Done |
| V3b | JS 动态 URL 兼容 | 已注入 runtime shim：`fetch`/`XMLHttpRequest`/`URL`/图片/媒体/script/link 根路径按 `/play/` base 改写；嵌套 `/play/<dir>/` 也已支持 | 提供受限 runtime shim 或项目 base URL 注入；不破坏第三方脚本 | Done |
| V4 | G6 视觉门集成 | 已加 `/api/playtest/visual` 与 Studio 截图评审按钮：Web 走 browser screenshot，Godot 走 `verify --visual`（有 key 时 openai vision），结果写入同一 run 历史 | Playtest 前后可触发截图/VLM 评审并记录 | Done |
| V5 | 真实 MCP 回归 | 已由 `godot-mcp` CI job 跑真实 server；场景节点校验 + artifact | CI 或专用 runner 跑真实 MCP 场景操作 | Done |

### V1 依赖

- Unity 许可证与 batchmode 环境。
- 如果 GitHub runner 无法稳定获得 Unity，则提供 self-hosted runner 配置和可选 job，不把不可执行 job 伪装成必过。

## 6. P0 · 资产管线

| ID | 事项 | 当前缺口 | 验收标准 | 状态 |
|---|---|---|---|---|
| AS1 | 动画关键帧序列 | 已支持 2–4 帧透明关键帧、动画节点播放/重生成；图集见 AS1b | 生成序列、节点预览、可重生成 | Done |
| AS1b | 动画图集 | 已支持 2–8 个同尺寸 PNG 横向打包、透明通道、frame/FPS/loop 元数据 | 图集文件、元数据、素材索引 | Done |
| AS1c | 引擎动画描述 | 已生成 Web JSON 与 Godot SpriteFrames `.tres`，并写入 `game/build-assets/animations/` | 图集、frame 元数据、引擎描述文件 | Done |
| AS1d | Web 模板动画接入 | Web survivor 自动读取 animations/index.json 并播放首个图集；Godot 未接 | Web 自动发现/播放 | Done |
| AS1e | Godot 模板动画接入 | 已支持扫描 `game/build-assets/animations/*.tres` 并优先加载首个 `SpriteFrames`；真实 Godot e2e 通过，打印 `GAMEDREAM_ANIMATION_OK` | 模板自动发现并播放动画资源 | Done |
| AS2 | Asset Canvas BGM 生成 | 已支持 30 秒 MiniMax BGM、任务轮询、mp3/sidecar、素材索引/试听、重命名；SFX 未做 | UI 内生成、显示进度、试听、重命名、加入构建 | Done |
| AS2b | 音频 SFX | 已支持 Studio 本地程序化 WAV（0.1–3 秒、提示词选类型、自动索引/预览/入构建）；AI 文本 SFX 见 AS3 | 自定义时长、SFX 生成 | Done |
| AS3 | AI SFX | 本机 ComfyUI 只有 MiniMax Music 3（音乐模型），无 Stable Audio checkpoint；`MireloVideoToSFX` 需要视频+云鉴权 | 程序化合成已加固（4ms/20ms 淡入淡出、去直流、−1dBFS 归一化、sidecar 标 `engine: procedural`）；接入路径与绑定写法已写进 `docs/comfyui-audio-animation.md`，等 checkpoint 落地即可接入 | Blocked |
| AS4 | BGM 模板覆盖 | Web/Unity survivor 及其余 Web/Unity 模板均已接入 staged BGM；音量滑杆仅 Web/部分模板 | Web/Unity survivor 统一接入 | Done |
| AS4b | Unity BGM 接入 | 已同步到 StreamingAssets，真实 Unity player smoke 打出 `UNITY_BGM_OK` | StreamingAssets 打包与音量/循环 | Done |
| AS4c | 其他模板 BGM | 5 个 Web 模板接入 staged BGM；Unity 6 个模板通过共享 `BgmPlayer` 接入并真实 smoke 打印 `UNITY_BGM_OK`；暂停/独立音量仍简化 | 按模板接入音量/循环与暂停 | Done |
| AS5 | Build selection 落地 | 已把选择素材复制到 `game/build-assets/` 并写 manifest；compose 保留；AS5b 进一步生成模板绑定 | 选择会物理进入项目、取消会移除托管副本、compose 后仍保留 | Done |
| AS5b | 素材自动绑定模板 | 已生成 `game/build-assets/bindings.json`（bgm/sfx/player/enemy/animations）；Web 模板绘制 player，Godot 优先应用 player/enemy 绑定，Unity 通过共享 `AssetBinding` 替换 player；三者均有真实/单元验证 | 按素材类型生成引用配置或提供可视化绑定 | Done |
| AS6 | 3D 资产 | glTF/LOD/骨骼/贴图管线未实现 | 导入/预览/引用/打包最小闭环 | Backlog |

动画路线参考 `docs/comfyui-audio-animation.md`：优先透明关键帧和 atlas；AnimateDiff 需要额外安装节点和 motion module，不能假定已有。

| ID | 事项 | 验收标准 | 状态 |
|---|---|---|---|
| AS7 | ComfyUI 工作流目录 | 一个工作流一个 JSON（name/description/kind/graph/bindings），UI 选择，Agent 可保存；旧单文件 fallback | Done |
| AS8 | 素材批量与 Asset Agent | 多行批量生成、素材 Agent 工具（生成/批量/图集/入构建/保存工作流）、事件与自动上画布 | Done |
| AS9 | 多 MCP / 多 skills | 多 server 命名空间、项目/全局配置发现、Claude Code `.claude/skills`、Studio 设置与 Agent 传递 | Done |
| AS10 | Studio 视觉简化与路径选择 | 暖白/墨黑/单一橄榄色主题；设置页所有路径支持本机文件/文件夹选择器，skills/MCP 为可增删列表 | Done |

## 7. P1 · 游戏内容深度

| ID | 事项 | 验收标准 | 状态 |
|---|---|---|---|
| C1 | Survivor 深度 | Web/Godot/Unity survivor 均已加精英变体、bolt→storm 进化、局外金币/伤害/HP 升级和持久存档；Web 有购买 UI，Unity 读取 meta 文件 | 武器进化、局外成长、持久货币、精英变体、存档；核心循环仍可 headless 验证 | Done |
| C2 | Roguelike 房间池 | Web/Godot/Unity roguelike 均已接 3 房池、cache/ambush、商店/遗物和难度递增；Web 用固定 seed 回归，Godot/Unity 各有真实 headless/EditorVerifier 标记 | 房间模板、事件、商店、遗物、难度曲线；固定 seed 可回归 | Done |
| C3 | 模板内容量 | 各短局循环已具备：survivor 60 秒/进化、roguelike 3 房、platformer 3 关（Web/Godot）、shooter/tower-defense 5 波、puzzle 多关、action-rpg 多关；仍非完整商业内容 | 把可玩切片提升为完整短局；每模板有关卡/敌人/结算验收 | Done |
| C4 | 多引擎内容一致性 | 已建立 `fixtures/contracts/engine-gameplay.json` 与契约测试；Web/Godot/Unity survivor/roguelike 共享房间/事件/遗物名称和 `SURVIVOR_*`/`ROGUELIKE_*` 标记 | Web/Unity/Godot 的同类模板共享内容模型和验收标记 | Done |
| C5 | Benchmark 扩展 | benchmark 已有 10 个 case、每 case 可玩性/意图评分和 `--visual` G6 分量；新增 action-rpg-boss/platformer-speedrun/survivor-evolution | 增加 prompt/case、可玩性、视觉可用性、意图一致性评分 | Done |

## 8. P1 · 发布与引擎

| ID | 事项 | 验收标准 | 状态 |
|---|---|---|---|
| R1 | Godot export templates CI | CI job 已下载 4.4.1 模板并执行 `smoke:godot-export --require`；本机模板曾缺失 | 本机安装 4.4.1 模板并真实导出 97MB `game.exe`；`dream godot templates` 缺模板时输出下载地址+目标目录、退出码 1，齐全时退出 0 | Done |
| R2 | Unity release runtime | 已通过真实 Unity build/player smoke/screenshot；本地 artifact 落盘，CI self-hosted job 上传 player | 真实 batchmode build、运行 marker、截图、artifact | Done |
| R3 | 真实 MCP CI | 已加 `godot-mcp` CI job，真实 `@coding-solo/godot-mcp` 创建/添加/保存场景并校验节点；本地证据 `godot-mcp-real.log` | 真实 Godot MCP 场景保存回归，不再只靠 fixture | Done |
| R4 | 发布回滚/签名 | Web/Godot package 写 SHA-256 清单并原子替换，失败保留旧包；Unity release 上传 player/log/screenshot；未做代码签名 | release artifact 可追溯、hash、失败保留旧包 | Done |

## 9. P0 · 跨平台正确性

| ID | 事项 | 验收标准 | 状态 |
|---|---|---|---|
| X1 | 非 ASCII 路径复制 | `fs.cpSync` 在 Windows 上对中文源/目标分别抛 `ENOENT` 和原生段错误（exit 139）；已统一改为 `copyPath`，覆盖 core/cli/studio/web/unity 共 12 处调用 | 中文目录 `create`/`verify` 通过、Studio 候选 apply/rollback 通过、源码禁止再出现 `cpSync(` | Done |
| X2 | Windows CI | CI 只有 ubuntu-esque job，Windows 专属失败无法被发现；已新增 `test-windows`（`windows-latest`）跑 typecheck/test/build + 中文路径冒烟 | Windows job 必过，中文路径 `G1: pass` | Done |
| X3 | Godot G2 崩溃分类 | G2 间歇崩溃（exit 3221225477/3221226356）被当作硬失败，可修复的引擎抖动被报成项目不可玩 | 崩溃单独分类、有界重试（≤2 次 + 退避），不出现在"项目失败"统计 | Done |
| X4 | 缺引擎时的 run 启动拦截 | 无 `GODOT_BIN` 时 verify 返回 skip 作为普通工具结果，Agent 不收敛并空转 scaffold | run 启动前抛环境错误，不消耗模型步数 | Done |
| X5 | 重复 scaffold 告警 | 模型反复 scaffold 时重新复制 kit + recompose，日志噪声且掩盖真实步骤 | 重复调用返回警告并要求显式 reset | Backlog |
| X6 | Studio 前端框架化 | 6101 行 vanilla JS、350+ 处 querySelector、42 处 innerHTML、三套手写轮询，无类型无测试；任务页左栏堆 6 个同级区块、运行历史左右各一份 | React 19 + Vite + TS + Radix + TanStack Query 重写三页；视觉仍走 theme.css；旧页面 8 文件 / 4589 行已删除，`/legacy*` 302 回落到新路由；`nav.test.ts` 锁定共享导航并禁止旧页面回流 | Done |

证据：`docs/evidence/windows-paths/`。

## 10. P2 · 长期方向

- Unreal 适配器与 Unreal MCP。
- 3D 游戏生成、场景编辑和资产管线。
- 云端协作、托管运行、团队素材库。
- Studio 远端访问的鉴权、用户隔离、任务沙箱。
- 多用户并发和远程 GPU 队列。

## 10.5 场景构建主线（S1–S6）

产品首要目标从"生成可玩切片"扩展到"在 Unity/Godot 里搭可复用、可追溯的场景"，
设计见 `docs/scene-agent.md`。

| 编号 | 事项 | 状态 |
| --- | --- | --- |
| S1 | 引擎无关 spec/kit/layout + 确定性求解器 + 质量闸门 + trace 数据集 + 俯视渲染 | Done |
| S2 | Godot 导出：`.tscn`（地面底图 + 建筑碰撞 + 入口/锚点 Marker），真实引擎加载并核对节点数 | Done |
| S2.1 | 导航：从可行走栅格生成 `NavigationPolygon`（顶点去重保证连通），引擎内验证出生点到每个入口都可寻路 | Done |
| S3 | Unity 导出：`.unity` + prefab 实例 + NavMesh | Next |
| S4a | Agent 循环 + CLI `dream scene build`：模型出 spec、闸门失败回喂重试、每次尝试落 trace | Done |
| S4b | Studio `/scenes` 页：列表 / 布局预览 / 闸门详情 / 人工评审写回 trace | Done |
| S5 | 数据管道：`dream scene dataset` 统计（失败分布/确定性/评审）+ SFT 与偏好对导出 | Done |
| S6 | 足量后训练布局模型或做监督微调 | Backlog |

S1 的验收：三个示例场景（河湾村 / 石十字镇 / 湖畔小村）全部通过闸门，
入口可达率 1.0，同种子布局哈希稳定。

## 11. 建议的下一步顺序

1. **AS3 AI SFX**：需要可用文本音效后端；当前保留程序化降级。
2. **R1 Godot 导出模板**：本机缺 1.2GB 模板，CI job 已接好。
3. **AS6 3D / Unreal / 远端鉴权**：长期方向。

已完成：X3（`status: 'error'` + 3 次尝试/退避 + exit code 4）、X4（`develop` 预检 + verify 工具显式环境错误）。

## 12. Definition of Done

一个事项只有同时满足以下条件才标记 Done：

- 有明确的用户入口或 API，不是只在测试里存在。
- 有失败态、空态和恢复/回滚路径。
- 有自动化测试；涉及真实引擎的还要有可复现 runtime 证据。
- `pnpm typecheck`、`pnpm test`、`pnpm build` 通过。
- 文档和 `docs/evidence/` 更新。
- 不把临时 mock、fixture 或手工验证描述成生产通过。

## 13. 风险与阻塞

| 风险 | 影响 | 处理 |
|---|---|---|
| Unity 许可证/runner 不可用 | V1、R2 阻塞 | 先做本地可复现脚本和可选 self-hosted job，不伪造 CI 通过 |
| ComfyUI 节点缺失 | 动画、AI SFX 受限 | 先做可用的关键帧/atlas/程序化降级，节点安装独立记录 |
| 长路径和 Windows 限制 | 候选/资产路径失败 | 使用短路径、路径校验和明确错误 |
| Windows 专属 fs 行为 | 已发生一次（`cpSync` 段错误） | 复制统一走 `copyPath`；`test-windows` job 兜底 |
| Studio 无鉴权 | 不能公网暴露 | 保持 localhost；远端化前加认证和沙箱 |
| Provider usage 缺失 | 预算/成本不准 | 显示未知，禁止用 0 伪造；支持 provider 能力声明 |

## 14. 维护约定

- 新事项先加 ID、验收标准和状态，再实现。
- 完成后把证据路径写回对应行。
- 优先删除已完成项，不保留“看起来完成”的模糊条目。
- 本文件是开发计划，具体 API 和行为以 `docs/studio.md`、`docs/ci.md`、`docs/architecture.md` 为准。

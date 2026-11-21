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
| Asset Canvas | 无限画布、真实素材索引、上传、Inspector、构建选择、真实 ComfyUI 1–4 变体生成、透明 PNG |
| Playtest | Web `/play/` iframe、Godot 外部窗口启动/停止、能力探测 |
| CI | MCP fixture smoke、真实 Godot 4.4.1 runtime smoke、typecheck/build/full tests |
| UI | 中文默认、中英切换、桌面/移动布局 |

当前验证基线：

- `pnpm typecheck` / `pnpm build`：exit `0`
- 全量测试：**227 passed / 9 skipped**
- Agent focused tests：**11 passed**
- 真实 Godot runtime：`G1=pass`、`G2=pass`、`G3=pass`、`engine=present`
- Agent smoke：`finished=true`、`score=1400`、`AGENT_APPROVAL_FLOW_OK=1`

证据位置：

- `docs/evidence/agent-loop/`
- `docs/evidence/runtime/godot-runtime.log`
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
| M1 | Agent 运行生产化 | 硬预算、队列、策略编辑、崩溃恢复 | In progress |
| M2 | 验证与试玩闭环 | 真实 playtest、Unity runtime、G6 集成 | Next |
| M3 | 资产管线完整化 | 动画、音频 UI、SFX、构建素材落地 | Next |
| M4 | 游戏内容深度 | survivor/roguelike/模板内容提升 | Backlog |
| M5 | 平台扩展 | Unity/Unreal/3D/协作 | Backlog |

## 4. P0 · Agent 运行生产化

| ID | 事项 | 当前缺口 | 验收标准 | 状态 |
|---|---|---|---|---|
| A1 | Token 硬预算 | 已实现总 token 和 prompt token 停止；provider 不返回 usage 时无法约束 | 达预算前停止、`run/budget` 事件、`budget-exceeded` 状态、CLI/Studio 测试 | Done |
| A1b | 费用/金额预算 | 尚无模型价格表和货币预算 | 按模型价格估算成本，达到预算前停止；未知价格显式标记 | Backlog |
| A2 | Agent 队列与并发 | 已支持 FIFO 批次队列、取消排队、自动接续；批级别并发上限为 1 | 连续提交不阻塞、queued 状态进入 SSE/UI、取消队列、当前批次结束后自动启动下一项 | Done |
| A3 | 审批策略编辑器 | 已支持按工具和默认模式的 allow/ask/deny 编辑、来源展示；参数级规则未实现 | 可按工具编辑、保存到 policy 文件、来源可见、未来 run 生效 | Done |
| A3b | 参数级审批规则 | 目前规则粒度只有工具名和默认模式 | 可按参数/路径范围匹配；越界操作仍走 ask/deny；审计记录 | Backlog |
| A4 | 硬崩溃子进程回收 | graceful restart 可恢复，hard crash 遗留进程不回收 | 持久化 PID/启动标识；重启时安全判断并回收旧进程 | Backlog |
| A5 | 运行历史 UI | API 有 batch history，Studio 主要显示 latest | 历史列表、切换查看、清理旧 batch | Backlog |
| A6 | Agent 失败重试 | 失败后需重新发起 | 支持 retry 当前 prompt、保留旧事件、明确新 generation | Backlog |

### A1 预算语义

- `maxSteps` 限制工具/模型步数，不限制成本。
- `maxTokens` 在累计 `prompt + completion` 达到上限后、下一次工具/模型动作前停止。
- `maxPromptTokens` 在累计 prompt token 达到上限后停止。
- 触发时写入 `run/budget`，报告 `budgetExceeded`，Studio 状态为 `budget-exceeded`。
- 不把未返回 usage 的 provider 当作“预算已生效”；金额预算仍待 A1b。

## 5. P0 · 验证与试玩

| ID | 事项 | 当前缺口 | 验收标准 | 状态 |
|---|---|---|---|---|
| V1 | Unity runtime/playtest | Studio 对 Unity 返回 501；CI 主要静态验证 | Unity batchmode build + runtime smoke + 截图；CI 可执行或明确 self-hosted 前置条件 | Next |
| V2 | Godot 内嵌试玩 | 当前打开独立 Godot 窗口 | 可行时提供内嵌/自动关闭和运行日志回传 | Backlog |
| V3 | Web 绝对路径兼容 | 已注入 `/play/` base 并重写 HTML/CSS 根路径；JS 动态路径仍未拦截 | HTML/CSS 绝对资源正确加载；相对路径构建不受影响；测试覆盖 | Done |
| V3b | JS 动态 URL 兼容 | 运行时 `fetch('/x')`、动态 `img.src` 等仍会落到 Studio 根 | 提供受限 runtime shim 或项目 base URL 注入；不破坏第三方脚本 | Backlog |
| V4 | G6 视觉门集成 | Playtest 与 G6 是两条路径 | Playtest 前后可触发截图/VLM 评审并记录 | Backlog |
| V5 | 真实 MCP 回归 | CI 使用 fixture，真实 Godot MCP 仍手工 | CI 或专用 runner 跑真实 MCP 场景操作 | Backlog |

### V1 依赖

- Unity 许可证与 batchmode 环境。
- 如果 GitHub runner 无法稳定获得 Unity，则提供 self-hosted runner 配置和可选 job，不把不可执行 job 伪装成必过。

## 6. P0 · 资产管线

| ID | 事项 | 当前缺口 | 验收标准 | 状态 |
|---|---|---|---|---|
| AS1 | 动画节点 | 没有 AnimateDiff loader/motion module；无 sprite sheet/atlas | 透明关键帧 → 序列 → PNG/atlas → 引擎资源；可预览和重生成 | Next |
| AS2 | Asset Canvas 音频生成 | 只能索引/试听已有音频 | UI 内生成 BGM/SFX、试听、重命名、加入构建 | Next |
| AS3 | AI SFX | 当前短音效主要是程序化合成 | 接入可用文本生成 SFX 后端；失败降级到程序化音效 | Backlog |
| AS4 | BGM 全模板覆盖 | 生成的 MiniMax BGM 只接 Godot survivor | Web/Unity survivor 及其他需要音频的模板统一接入音量和循环设置 | Next |
| AS5 | Build selection 落地 | `Use in build` 仍是画布元数据 | 选择素材会复制到模块/项目并参与 compose；保留来源和撤销 | Next |
| AS6 | 3D 资产 | glTF/LOD/骨骼/贴图管线未实现 | 导入/预览/引用/打包最小闭环 | Backlog |

动画路线参考 `docs/comfyui-audio-animation.md`：优先透明关键帧和 atlas；AnimateDiff 需要额外安装节点和 motion module，不能假定已有。

## 7. P1 · 游戏内容深度

| ID | 事项 | 验收标准 | 状态 |
|---|---|---|---|
| C1 | Survivor 深度 | 武器进化、局外成长、持久货币、精英变体、存档；核心循环仍可 headless 验证 | Backlog |
| C2 | Roguelike 房间池 | 房间模板、事件、商店、遗物、难度曲线；固定 seed 可回归 | Backlog |
| C3 | 模板内容量 | 把可玩切片提升为完整短局；每模板有关卡/敌人/结算验收 | Backlog |
| C4 | 多引擎内容一致性 | Web/Unity/Godot 的同类模板共享内容模型和验收标记 | Backlog |
| C5 | Benchmark 扩展 | 增加 prompt/case、可玩性、视觉可用性、意图一致性评分 | Backlog |

## 8. P1 · 发布与引擎

| ID | 事项 | 验收标准 | 状态 |
|---|---|---|---|
| R1 | Godot export templates CI | 安装 4.4.1 模板并真实导出 artifact；本地/CI 状态可区分 | Next |
| R2 | Unity release runtime | 真实 batchmode build、运行 marker、截图、artifact | Next |
| R3 | 真实 MCP CI | 真实 Godot MCP 场景保存回归，不再只靠 fixture | Backlog |
| R4 | 发布回滚/签名 | release artifact 可追溯、hash、失败保留旧包 | Backlog |

## 9. P2 · 长期方向

- Unreal 适配器与 Unreal MCP。
- 3D 游戏生成、场景编辑和资产管线。
- 云端协作、托管运行、团队素材库。
- Studio 远端访问的鉴权、用户隔离、任务沙箱。
- 多用户并发和远程 GPU 队列。

## 10. 建议的下一步顺序

1. **AS5 Build selection 落地**：让素材选择真正进入 composer。
2. **AS1 动画节点**：在本地 ComfyUI 可用节点范围内先做透明帧/atlas，不等待 AnimateDiff。
3. **V1 Unity runtime**：确认 runner 与许可证后，把 Unity playtest/release 从静态检查推进到真实运行。

## 11. Definition of Done

一个事项只有同时满足以下条件才标记 Done：

- 有明确的用户入口或 API，不是只在测试里存在。
- 有失败态、空态和恢复/回滚路径。
- 有自动化测试；涉及真实引擎的还要有可复现 runtime 证据。
- `pnpm typecheck`、`pnpm test`、`pnpm build` 通过。
- 文档和 `docs/evidence/` 更新。
- 不把临时 mock、fixture 或手工验证描述成生产通过。

## 12. 风险与阻塞

| 风险 | 影响 | 处理 |
|---|---|---|
| Unity 许可证/runner 不可用 | V1、R2 阻塞 | 先做本地可复现脚本和可选 self-hosted job，不伪造 CI 通过 |
| ComfyUI 节点缺失 | 动画、AI SFX 受限 | 先做可用的关键帧/atlas/程序化降级，节点安装独立记录 |
| 长路径和 Windows 限制 | 候选/资产路径失败 | 使用短路径、路径校验和明确错误 |
| Studio 无鉴权 | 不能公网暴露 | 保持 localhost；远端化前加认证和沙箱 |
| Provider usage 缺失 | 预算/成本不准 | 显示未知，禁止用 0 伪造；支持 provider 能力声明 |

## 13. 维护约定

- 新事项先加 ID、验收标准和状态，再实现。
- 完成后把证据路径写回对应行。
- 优先删除已完成项，不保留“看起来完成”的模糊条目。
- 本文件是开发计划，具体 API 和行为以 `docs/studio.md`、`docs/ci.md`、`docs/architecture.md` 为准。

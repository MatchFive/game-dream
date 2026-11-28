# 项目进度表

> 基线：`master@ebe467c`（2026-11-28）· 本表是「现在该做什么」的一页视图
> 完整历史、验收细节与证据在 [`roadmap.md`](roadmap.md)；ID 与 roadmap 共用，不重复定义。

## 1. 一页进度

| 主线 | 范围 | 进度 | 状态 |
| --- | --- | --- | --- |
| M0 跨平台正确性 | 统一 `copyPath`、Windows CI、中文路径 | 5/6 | Done（X5 噪声项留 backlog） |
| M1 Agent 运行生产化 | 预算、队列、审批策略、崩溃回收、重试 | 8/8 | Done |
| M2 验证与试玩闭环 | Godot/Unity runtime、G6 视觉门、MCP 回归 | 7/7 | Done |
| M3 资产管线 | 动画/图集/BGM/SFX/绑定 | 16/18 | 差 AS3（缺模型）/ AS6（3D） |
| S 场景构建 | 求解器 → 引擎工程 → 数据管道 | 9/11 | **当前主线**（差 S3 Unity / S6 训练） |
| M4 内容深度 | 7 类游戏模板的短局循环 | 5/5 | Done |
| M5 平台扩展 | Unity/Unreal/3D/协作 | 0/4 | Backlog |

当前硬指标（可复跑）：

```
pnpm typecheck / build              10 包通过
pnpm test                           402 passed / 15 skipped / 0 failed
scene 三示例（河湾村/石十字镇/湖畔小村）  闸门全 PASS，入口可达率 1.0
真实 Godot 4.4.1 导出              nav 32/32、65/65、15/15；tiles 7680/819 等
Studio 导出按钮（产品路径）          26 实例 / 6912 地形格 / nav 26/26
```

## 2. 现在能做什么

已经能用、且经过真实引擎验证的能力（不要当待做项重新规划）：

- `dream scene build --prompt "临河小镇…"` → `SceneSpec` → 布局 → **可编辑 Godot 工程**
- 工程内容：`TileMapLayer` ×2（地形/道路）、`prefabs/*.tscn` 实例、碰撞、正门 Marker、
  `NavigationRegion2D`（出生点到每栋建筑的门都能寻路）、四面边界墙
- 闸门 9 类（越界/重叠/压水/门口被堵/不可达/空场景/过密/过疏/缺要素）+ 形态指标
  （`streetWall` / `courtyards` / `standalone` / `attachedShare`）
- 每次尝试写 trace → `dream scene dataset` 出统计、SFT 样本、偏好对
- Studio `/scenes`：列表、布局预览、闸门详情、人工评审、**导出 Godot 工程**

## 3. 当前焦点

1. **D1 用真模型跑量** —— 管道齐了但没有真实样本，S6 无从谈起，也看不见模型的真实失败分布。
2. **S3 Unity 导出** —— 产品定位是"Unity/Godot 双引擎"，现在只有 Godot 一半。
3. **Q1 导出回归进 CI** —— prefab/tilemap 结构刚改完，没有 CI 兜底，下次改动会悄悄坏。

## 4. 待做需求

规模：**S** ≤ 1 天 / **M** 2–3 天 / **L** 1 周以上。价值一列写"不做会怎样"。

### P0 · 不做就不能用

| ID | 需求 | 价值（不做会怎样） | 验收标准 | 依赖 | 规模 |
| --- | --- | --- | --- | --- | --- |
| S3 | Unity 导出：`.unity` + prefab 实例 + NavMesh | 一半用户进不来；同一份 layout 只能出 Godot | Unity EditorVerifier 打开导出工程；建筑数/Marker 数与 layout 一致；NavMesh 采样到每个门 < 0.5m | Unity 6 本机已可 batchmode | L |
| D1 | 真模型批量跑量（50–100 条 prompt） | 没有真实 trace，训练与提示词优化都是空谈 | `--provider auto` 产出 ≥100 条 trace；输出通过率、失败分布、`standalone/attachedShare` 分布 | MiniMax 已配 | S |
| Q1 | 场景导出进 CI（`test-scene` job） | prefab/tilemap/`.tscn` 语法一变，线上才炸 | CI 有 Godot 时跑 `scene-godot-smoke`，无引擎时显式 skip + 报告 | `GODOT_BIN` 或 CI 下载 | S |
| T1 | 真实 tileset 替换程序瓦片 | 地面仍是配色块，接不了美术 | `scene/tiles.png` 换成带过渡/边角的 tileset 后工程可直接用；kit 声明 tile 映射；三示例截图对比 | 美术资源 | M |

### P1 · 明显提升价值

| ID | 需求 | 价值（不做会怎样） | 验收标准 | 依赖 | 规模 |
| --- | --- | --- | --- | --- | --- |
| S7 | 场景高度与天际线 | 纯平面，城市"好看"主要靠高度与遮挡；`floors` 目前随机 | 高度按街区分层（主街高、背街低），预览与导出体现楼层差 | — | M |
| S9 | prefab 附加节点（kit 扩展） | prefab 只有贴图+碰撞，灯光/招牌/交互挂不上去，不算真 prefab | kit 支持 `nodes[]`（type/name/offset/props），导出写进 `prefabs/*.tscn`；引擎加载节点数匹配 | — | M |
| S10 | 场景片段/模块复用 | 逐栋生成不可控；真实关卡是"广场围合、码头区、市场街"这类模块拼的 | `segments/` 定义 + 拼装规则；trace 记录用了哪些片段 | S7 | L |
| S8 | 世界地图与区域连接 | 只能造单点聚落；RPG 需要"多场景 + 连接" | `WorldSpec`（聚落 + 道路 + 地形带）→ 世界布局；每个聚落可单独展开；导出含区域跳转标记 | S3 或 S2 | L |
| D2 | badcase 看板（Studio） | 失败只能靠命令行数字；调提示词/求解器没有靶子 | `/scenes/insights`：按 issue 聚类、点开看布局与评审、导出筛选后的样本 | D1 | M |
| U1 | Studio 场景编辑（拖拽/微调） | agent 出的布局总要人修两笔；不能改就只能重生成 | 画布拖动建筑、改门朝向，保存回 layout 并写 `origin=human-edit` 的 trace | — | L |
| T2 | 建筑贴图一致性生产化 | 7 张图靠提示词碰运气，一套 kit 像两三套素材 | 参考图 + i2i 或风格 LoRA；给出可量化的色调/笔触一致性对比 | ComfyUI edit 工作流 | M |
| S11 | 场景交互点 | 场景只能看不能碰（商店门、可拾取、触发器） | layout 支持 `interactions[]`，导出为 Area2D + 元数据；引擎内可触发 | S9 | M |
| R5 | 导出工程版本迁移 | Godot 小版本升级后 `.tscn`/TileSet 格式可能漂移 | 固定 `format=3` 校验 + 目标版本声明；升级时有回归用例 | — | S |

### P2 · 长期 / 外部依赖

| ID | 需求 | 状态 | 阻塞原因 |
| --- | --- | --- | --- |
| S6 | 布局模型训练 / 监督微调 | Backlog | 需先有量：≥500 通过样本、≥200 偏好对，且必须留 held-out 评估 |
| AS3 | AI 文本音效 | Blocked | 本机无 Stable Audio checkpoint；接入路径已写在 `docs/comfyui-audio-animation.md` |
| AS6 | 3D 资产（glTF/LOD/骨骼） | Backlog | 与场景主线无共用管线，需独立设计 |
| S12 | Unreal 场景导出（引擎适配器） | Backlog | 依赖 Unity 侧先跑通同一套 layout 抽象 |
| X5 | 重复 scaffold 告警 | Backlog | 噪声问题，不阻塞主流程 |
| U2 | Studio 远端化（鉴权/多用户） | Backlog | 目前只绑 localhost；公网暴露前必须有认证与沙箱 |

## 5. 数据飞轮现状

| 环节 | 状态 | 数字 |
| --- | --- | --- |
| 采集 | ✅ 可用 | 每次构建/重试/评审都写一行 trace（`origin` 区分 agent/manual） |
| 统计 | ✅ 可用 | `dream scene dataset`：通过率、失败分布、确定性、评审分布 |
| 导出 | ✅ 可用 | SFT（只收过闸门样本）+ 偏好对（闸门 pass/fail、人工 good/bad） |
| **样本量** | ❌ 不足 | 真实模型 trace ≈ 0；批量脚本目前跑的是桩模型基线 |
| 训练 | ⛔ 未开始 | 门槛见下 |

起步门槛（经验值，需用 held-out 集验证，不是拍脑袋的承诺）：

- 布局 spec 生成（SFT）：**≥ 500 条通过闸门的样本**，覆盖 village/town/city/camp 四类
- 偏好对：**≥ 200 对**，且 good/bad 来自同一 prompt 的不同尝试
- 评估：固定 20 条 held-out prompt，比较"闸门通过率 + 人工评审通过率"，不看 loss

## 6. 阻塞与外部依赖

| 项 | 影响 | 现状 | 解法 |
| --- | --- | --- | --- |
| Stable Audio checkpoint | AS3 无法落地 | 节点在、模型缺 | 下载 1–4GB checkpoint（可能需 HF 授权） |
| 美术资源 | T1/T2 卡在"能用"和"好看"之间 | 现在是 AI 单张生成 | 真 tileset / 建筑套图，或参考图 + i2i 收敛风格 |
| Unity 许可 | S3 只能本机验证 | 本机可 batchmode | 若要 CI 化需 self-hosted runner |
| 真实模型额度 | D1 的样本量 | MiniMax 已配 | 按 100 条 prompt 估一下 token 成本再跑 |

## 7. 明确不做（当前阶段）

- 不做"一句话直接出成品游戏"：当前定位是**场景与资产的可编辑工程**，不是成品发行。
- 不做云端多租户：Studio 只绑 localhost，远端化前不接外部流量。
- 不在 Unity 出口跑通前启动 UE/3D：先让第二个出口真的可用，再摊第三条链路。
- 不为"看起来完成"补 mock：宁可在表里标 Blocked。

## 8. 维护约定

1. 新需求先在本表加一行（ID / 价值 / 验收 / 依赖 / 规模），再动手。
2. 完成后从"待做"删掉，把证据写进 `roadmap.md` 对应行 + `docs/evidence/`。
3. 每轮开发结束更新第 1 节的硬指标数字（测试数、nav、tiles）。
4. 与 roadmap 冲突时，以 roadmap 的验收标准为准；本表只决定顺序。

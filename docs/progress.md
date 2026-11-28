# 项目进度表

> 基线：`master`（2026-11-28）· 本表是「现在该做什么」的一页视图
> 完整历史、验收细节与证据在 [`roadmap.md`](roadmap.md)；ID 与 roadmap 共用，不重复定义。

## 0. 硬约束（不可协商）

> 2026-11-28 补记：场景库已搬进项目（`<project>/game/scenes/<id>/`），不再是
> `.gamedream/studio/exports` 下的独立工程——见 `docs/evidence/s16-scenes-in-project/`。
> 证据里的场景一律由项目 agent 产出（trace 重放），外部 agent 不再手写场景 spec。
>
> 同日：CLI 也有 `--project` 出口，Studio 与 CLI 走同一组函数
> （`studio/src/scenes.ts` 的 `buildScene` / `exportScene`）——见 `docs/evidence/s17-cli-project/`。

**所有涉及游戏本身的实现——玩法、关卡、场景、模板脚本、美术、游戏侧测试——只能由项目
内置 agent 执行。** 外部编码 agent（WorkBuddy、Claude Code、Copilot 等）只能走三条通道：

| 通道 | 做法 | 产物 |
| --- | --- | --- |
| 改项目代码 | 直接改 `packages/**`、`scripts/**`、`docs/**` | 工具能力 |
| 发需求 | `dream request new --title ... --prompt ... --accept ...` | `requests/<id>.json` |
| 调项目 agent | `dream request run <id> --out <dir>` / `dream develop ...` | 游戏实现 + 运行记录 |

禁止：直接写 `templates/**`、`modules/**`、`skills/**`、`fixtures/contracts/**`；
往 `.gamedream/**`、`game/build-assets/**` 放美术/音频/场景；手写 `.tscn` / `.unity` /
`.gd` / `.cs` 到仓库。

判定：`pnpm check:boundaries`（CI 必跑）。规则全文见 [`boundaries.md`](boundaries.md)，
给编码 agent 的速查版见 [`../AGENTS.md`](../AGENTS.md)。

> 写**生成器**（导出器里拼 `.tscn` 的代码）合法；写**产物**（手搓一个 `.tscn`）不合法。

## 1. 一页进度

| 主线 | 范围 | 进度 | 状态 |
| --- | --- | --- | --- |
| M0 跨平台正确性 | 统一 `copyPath`、Windows CI、中文路径 | 5/6 | Done（X5 噪声项留 backlog） |
| M1 Agent 运行生产化 | 预算、队列、审批策略、崩溃回收、重试 | 8/8 | Done |
| M2 验证与试玩闭环 | Godot/Unity runtime、G6 视觉门、MCP 回归 | 7/7 | Done |
| M3 资产管线 | 动画/图集/BGM/SFX/绑定 | 16/18 | 差 AS3（缺模型）/ AS6（3D） |
| S 场景构建 | 求解器 → 引擎工程 → 数据管道 | 16/18 | **当前主线**（差 S3 Unity / S6 训练） |
| M4 内容深度 | 7 类游戏模板的短局循环 | 5/5 | Done |
| M5 平台扩展 | Unity/Unreal/3D/协作 | 0/4 | Backlog |

当前硬指标（可复跑）：

```
pnpm typecheck / build              9 包通过
pnpm test                           479 passed / 15 skipped / 0 failed
scene 三示例（河湾村/石十字镇/湖畔小村）  闸门全 PASS，入口可达率 1.0
真实 Godot 4.4.1 导出（六场景）      nav 32/32、65/65、15/15、33/33、60/60、72/72
CI scene-export job                 有引擎跑真机加载；无引擎仍导出六工程做结构核对并写明 skip
  海岸 / 城墙 / 三级台阶            walls=22、cliffs=28 碰撞体与 layout 逐项相等
  地形 / 道路 / 道具三层             道具 84/99/37/97/113/91 格，与 layout.props 相等
  楼层进引擎                         floors 和，与 layout 相等
  附加节点进引擎                     lights/zones/markers 与 kit 声明逐项相等（六场景全绿）
  交互点进引擎                       interactions 4/4/1/4/4/5，kind 集合与 layout 相等
真模型重跑五条"地形"需求            5/5 过闸门，三条 unmet 归零
Studio 导出按钮（产品路径）          26 实例 / 6912 地形格 / nav 26/26
项目内加载场景（真实工程）        0 ERROR；buildings 22 / nav 22/22 / atlas true
CLI `--project` 建进真实工程        0 ERROR；res://game/scenes/harbour-quarter；工程根 project.godot 未改
badcase 看板（演示数据可复现）       29 场景 / 26 过 / 3 未过 / 24 带 unmet；missing-required×3、no-buildings×3
真模型重跑两条"路宽"需求            2/2 过闸门，unmet 归零（宽阔→6、狭窄→2/1/13）
```

## 2. 现在能做什么

已经能用、且经过真实引擎验证的能力（不要当待做项重新规划）：

- `dream scene build --prompt "临河小镇…" --project <root>` → `SceneSpec` → 布局 →
  **项目里的场景**（`game/scenes/<id>/`，游戏侧 `preload("res://game/scenes/<id>/scene.tscn")`）；
  `--out` 仍是独立工程出口（想单独打开看时用）
- 工程内容：`TileMapLayer` ×3（地形/道路/道具）、`prefabs/*.tscn` 实例、碰撞、正门 Marker、
  `NavigationRegion2D`（出生点到每栋建筑的门都能寻路）、四面边界墙
- 闸门 10 类（越界/重叠/压水/门口被堵/不可达/空场景/过密/过疏/缺要素/城墙围死）+ 形态指标
  （`streetWall` / `courtyards` / `standalone` / `attachedShare`）
- 每次尝试写 trace → `dream scene dataset` 出统计、SFT 样本、偏好对
- Studio `/scenes`：列表、布局预览、闸门详情、人工评审、**导出 Godot 工程**
- `dream scene art`：按 kit 逐 prefab 生成 3/4 视角贴图（自动注入透明分支 + 裁边 + manifest），
  项目能力而非一次性脚本；旧的 `scripts/scene-art-ai.mjs` 已删除
- `dream scene batch`：批量跑需求（真模型/桩模型皆可）→ trace → 统计 → SFT/偏好对；
  首批 24 条真实样本已入库（`docs/evidence/scene-batch/`）
- `spec.unmet[]`：模型必须声明"这份 format 做不到"的需求；统计、CLI、Studio 场景页可见。
  重跑同一批：19/25 样本带 unmet，且表述准确（城墙/海岸/崖/等高线/水渠/仓库…）
- **地形与边界**：`water: "coast"`（海沿一边铺开、起伏岸线、岸边一格沙）、
  `walls`（贴建成区成环、路口自动开门、导出 `TownWalls` 碰撞体与 `Gates` 标记）、
  `elevation`（按 `step` 切台阶、崖线错开走等高线、路穿崖处变坡道、导出 `Cliffs` 碰撞体）；
  城墙外留一圈田野。证据 `docs/evidence/s13-terrain/`
- **道具进引擎**：树/井/灯/箱/牌/码头/花做成透明底瓦片，导出成 `Props` TileMapLayer
  （排在地形与道路之后）。之前它们只存在于预览 SVG，导出的城里全是空地。
  证据 `docs/evidence/s15-props/`
- **场景属于项目**：场景库在 `<project>/game/scenes/<id>/`（`scene.json` + 预览 + 引擎文件），
  `index.json` 给游戏侧发现；导出走 `res://game/scenes/<id>/scene.tscn`，真实 `dream create`
  工程里 0 条 ERROR 加载、nav 22/22。证据 `docs/evidence/s16-scenes-in-project/`
- **素材库页面**（Studio `/library`）：缩略图网格 + 类型/语义/图集过滤 + 详情；
  选中写进 URL；**prefab 建议可人工改**并写回索引（模型会把十几块都建议成同一个，
  必须能纠）。缩略图现场裁、素材库路径失效会显式提示。证据 `docs/evidence/t2c-library/`
- **素材理解与索引**：`dream scene assets index` 切片 + 视觉模型逐块分类（kind/label/tags/prefab），
  产出可查询的 `art-index.json`；`find` 按语义检索，`apply` 直接落成某个 kit 的立绘。
  一张图集 88 个精灵：building 31 / prop 22 / gate 8 / terrain 8…，模型自己认出
  "铁匠铺""两层灯笼酒肆"。证据 `docs/evidence/t2-art-index/`
- **真 tileset 接入**：外部素材库（96×96 单元）→ `dream scene tiles import` 按选取表切成
  32px 瓦片 → 导出器 `TileMapLayer` 直接用真美术，没有素材的地形继续程序生成。
  新增中式套件 `village-cn`（几何同欧式，换画风配色）。证据 `docs/evidence/t1-art-tiles/`
- **CLI 与 Studio 同一个出口**：`dream scene build --project <root>` 直接落进项目（目录名取
  `spec.id`，`--id` 指定、`--replace` 复用并清旧 prefab）；两条产品路径调的是同一组函数，
  不会各写一套。证据 `docs/evidence/s17-cli-project/`
- **场景交互点**：`kit.prefabs[].interactions[]`（rest/shop/trade/worship/craft/fish）→
  `layout.interactions[]`（落在正门那一格）→ 导出 `Area2D` + `metadata/kind`；
  新闸门 `interaction-blocked`，指标 `interactions`/`interactionKinds`。证据 `docs/evidence/s11-interactions/`
- **prefab 附加节点**：`kit.prefabs[].nodes[]`（light/area/marker），位置按 footprint 比例，
  `anchor: "entrance"` 的节点跟着门走；导出成 `PointLight2D`/`Area2D`/`Marker2D`，
  引擎自检点数与 kit 声明对账。证据 `docs/evidence/s9-prefab-nodes/`
- **路网参数**：`roads: { mainWidth, streetWidth, spacing }`（默认 4/2/18，间距下限 13），
  窄街老城与宽阔大道是同一套代码的两种参数；顺带修掉路面偏一格、每排尾巴空 4 格。
  证据 `docs/evidence/s14-roads/`
- **badcase 看板**：`/scenes/insights` 按闸门与 unmet 聚类（括号注释剥掉再聚、
  原话保留），点开看布局与评审，一簇样本可导出 JSONL；选中写进 URL 可分享。
  证据 `docs/evidence/d2-insights/`
- **天际线**：楼层 = 聚落规模 × 临街性质（城 3–4 / 次级街 2–3 / 背巷 1–2 / 营地全 2 层），
  判断依据写进 `building.band` 可追溯；预览按楼层投长影，导出写 `metadata/floors`。
  证据 `docs/evidence/s7-skyline/`

## 3. 当前焦点

1. **S3 Unity 导出** —— 产品定位是"Unity/Godot 双引擎"，现在只有 Godot 一半。
   地形/墙/台阶已经在引擎无关层（`SceneLayout`）里表达完整，第二个出口可以直接吃同一份 layout。
   **阻塞**：本机没有 Unity 安装（`/c/Program Files` 下无 `Unity`，settings 里 `unityBin` 为空），
   只能写代码不能真机验收——按"不为看起来完成补 mock"的约定，先不硬做。
2. **场景还没被游戏引用** —— `index.json` 只是接口，把场景接进 `main.tscn`（进关卡、切场景、
   传交互点）属于游戏实现，必须走 `dream request`，不能由我改 `templates/**` / `modules/**`。
3. **跑全量素材索引** —— 机制和浏览页都通了（1 张图集 / 88 精灵），但剩下 215 张没跑
   （~1300 次模型调用，且没有断点续跑）。页面里也只能看，不能触发建索引。

## 4. 待做需求

规模：**S** ≤ 1 天 / **M** 2–3 天 / **L** 1 周以上。价值一列写"不做会怎样"。

### P0 · 不做就不能用

| ID | 需求 | 价值（不做会怎样） | 验收标准 | 依赖 | 规模 |
| --- | --- | --- | --- | --- | --- |
| S3 | Unity 导出：`.unity` + prefab 实例 + NavMesh | 一半用户进不来；同一份 layout 只能出 Godot | Unity EditorVerifier 打开导出工程；建筑数/Marker 数与 layout 一致；NavMesh 采样到每个门 < 0.5m | 地形/墙/台阶已在 layout 层就绪 | L |

### P1 · 明显提升价值

| ID | 需求 | 价值（不做会怎样） | 验收标准 | 依赖 | 规模 |
| --- | --- | --- | --- | --- | --- |
| S10 | 场景片段/模块复用 | 逐栋生成不可控；真实关卡是"广场围合、码头区、市场街"这类模块拼的 | `segments/` 定义 + 拼装规则；trace 记录用了哪些片段 | S7 | L |
| S8 | 世界地图与区域连接 | 只能造单点聚落；RPG 需要"多场景 + 连接" | `WorldSpec`（聚落 + 道路 + 地形带）→ 世界布局；每个聚落可单独展开；导出含区域跳转标记 | S3 或 S2 | L |
| U1 | Studio 场景编辑（拖拽/微调） | agent 出的布局总要人修两笔；不能改就只能重生成 | 画布拖动建筑、改门朝向，保存回 layout 并写 `origin=human-edit` 的 trace | — | L |
| T2b | 跑全量素材索引（216 张） | 现在只索引了 1 张；剩下 215 张要 ~1300 次模型调用，没有断点续跑 | `--limit` 分批跑 + 已索引图集跳过；索引合并且不重花 token | T2 | S |
| T3 | 道具做成 2×2 贴花 | 96px 自然尺寸的道具缩到 1 格只剩 13px 宽，远看是小点 | props 支持多格占位（导出改 Sprite2D 或 2×2 tile），引擎内道具数不变 | T1 | M |
| T4 | 地形过渡（autotile） | 草地/水岸/路面都是硬边方块，拼起来像贴图集而不是地表 | 草↔土、路↔土、水岸三类过渡瓦片；引擎内查接缝 | T1 | M |
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
| **样本量** | ⚠️ 起步 | 真实模型 30 条（首批 24 + 地形回归 6），通过 26；离 500 还差一个数量级 |
| 训练 | ⛔ 未开始 | 门槛见下 |

起步门槛（经验值，需用 held-out 集验证，不是拍脑袋的承诺）：

- 布局 spec 生成（SFT）：**≥ 500 条通过闸门的样本**，覆盖 village/town/city/camp 四类
- 偏好对：**≥ 200 对**，且 good/bad 来自同一 prompt 的不同尝试
- 评估：固定 20 条 held-out prompt，比较"闸门通过率 + 人工评审通过率"，不看 loss

## 6. 阻塞与外部依赖

| 项 | 影响 | 现状 | 解法 |
| --- | --- | --- | --- |
| Stable Audio checkpoint | AS3 无法落地 | 节点在、模型缺 | 下载 1–4GB checkpoint（可能需 HF 授权） |
| 美术资源 | 全量索引（215 张未跑） | 索引机制已通，只是没跑完；且缺断点续跑 | 分批跑 + 已索引跳过（T2b） |
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

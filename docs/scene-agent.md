# 场景 Agent：可复用、可追溯、可训练的场景构建

目标不是"生成一张好看的图"，而是让 agent 在 Unity / Godot 项目里**可靠地搭出
可走的场景**：RPG 的城市与村庄排布、世界地图的骨架。每次尝试都要留下结构化记录，
既能当数据集，也能当 badcase 分析的材料。

## 1. 分层：语义归模型，几何归算法

| 层 | 由谁负责 | 产出 |
| --- | --- | --- |
| 需求理解 | LLM | `SceneSpec`：聚落类型、必须出现的建筑、水域、密度、尺寸 |
| 几何布局 | 确定性求解器 | `SceneLayout`：道路网、地块、建筑、装饰、锚点 |
| 质量判定 | 闸门（可量化） | `SceneValidation`：连通性、重叠、密度、覆盖率 |
| 引擎落地 | 导出器 | Godot `.tscn` + `TileMapLayer`，Unity `.unity` + prefab 实例 |

关键判断：**不让模型直接吐坐标**。模型给不出"入口必须连到路"这种约束保证，
一旦失败就无法定位是语义错还是几何错。拆开后，badcase 可以精确定位到某一层。

## 2. 数据模型

`packages/scene`，与引擎无关：

- `SceneSpec`（输入）：`kind`、`seed`、`bounds`、`required`（必须有 prefab）、
  `water`、`decor`、`kitId`
- `Kit`（可复用资产）：建筑套件，含 prefab 的 `role` / `footprint` / `weight` /
  `color` / `roof` / `mainRoad`，以及调色板。换 kit 就换风格，求解器不变
- `SceneLayout`（输出）：`roads`（主干道 + 巷道折线）、`lots`（地块分类）、
  `buildings`（rect + 朝向 + 入口点）、`props`、`anchors`（spawn/exit/poi）

确定性：`seed` 相同 → 布局哈希相同。这是"可追溯"能成立的前提。

## 3. 求解器做了什么

`buildScene(spec, kit)`：

1. 十字主干道（宽 4，位置随种子偏移，不机械居中）；**地图 ≥120 宽或 ≥100 高时**，
   每 18 格补一条宽 2 的次级街道，形成街区网格
2. 水系：河流横穿并在主干道处留桥；池塘按圆裁切
3. 交叉口广场 + 水井
4. 四个街区 BSP 递归切分成地块（最小 8 格）
5. 地块内放建筑：贴内侧 1 格、正门朝最近道路、尺寸在 footprint 区间内取值；
   **压到水面的地块直接跳过**
6. 每条建筑入口向道路挖一条 1 格宽 L 形巷道 —— 让建筑真的"接上路网"，
   而不是浮在空地上
7. 沿主干道布灯、绿地种树、广场摆放、水边放码头
8. 出生点（南端主干道）与出口（东端）

## 4. 质量闸门

`validateScene()` 返回 `pass`、`metrics`、`issues`，issues 的 code 就是 badcase 的分类：

| code | 含义 |
| --- | --- |
| `out-of-bounds` | 越界 |
| `overlap` | 建筑互相压盖 |
| `on-water` | 建筑压在水面 |
| `blocked-entrance` | 入口落在不可走格子 |
| `unreachable` | 入口从出生点不可达（四邻接 BFS） |
| `no-buildings` | 求解器什么都没放 |
| `too-dense` / `too-sparse` | 密度越界（>0.6 / <0.05） |
| `missing-required` | 需求清单里的 prefab 没出现 |

指标（`density`、`roadRatio`、`greenRatio`、`waterRatio`、`entranceCoverage`）
直接作为样本的质量标签，可用来做回归与排序。

## 5. 可追溯：trace 即数据

每次构建产出一条 `SceneTrace`（JSONL 一行）：

```jsonc
{
  "schema": 1,
  "id": "scene-2026-11-28T...",
  "origin": "agent",              // agent / solver / manual
  "spec": { "id": "...", "seed": 20261128, ... },
  "kit": { "id": "village-euro", "hash": "3f2a..." },
  "steps": [                      // 每步都留痕：plan → layout → validate → export
    { "phase": "plan", "summary": "kind=village, bounds=96x80", "at": "..." },
    { "phase": "layout", "summary": "placed 15 buildings in 24 lots", "data": { "buildings": ["tavern", "chapel"] } },
    { "phase": "validate", "summary": "gates passed", "data": { "metrics": { "density": 0.082 } } }
  ],
  "validation": { "pass": true, "metrics": { ... }, "issues": [] },
  "output": { "layoutHash": "73385963", "buildings": 15, "props": 76, "lots": 24 },
  "durationMs": 12,
  "review": { "score": 4, "verdict": "good", "notes": "教堂位置偏离广场" }
}
```

这份记录同时服务三件事：

1. **复现**：`spec + kit.hash + seed` 能重建同一场景；哈希不一致说明求解器变了
2. **badcase 分析**：按 `issues[].code` 聚合，能看出模型/求解器系统性地错在哪
   （例如"河岸地块 20% 不可达"），而不是靠人眼看图
3. **训练数据**：`(spec, steps, layout, metrics, review)` 就是一条 SFT 样本；
   `review.verdict` 是偏好对（good vs bad）的来源

## 6. 阶段计划

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| S1 | 引擎无关的 spec/kit/layout + 求解器 + 闸门 + trace + 俯视渲染 | **Done** |
| S2 | Godot 导出：锚点/建筑/碰撞/地面底图，真实引擎加载核对节点数 | **Done** |
| S3 | Unity 导出：`.unity` 场景 + prefab 实例 + NavMesh 烘焙参数 | Next |
| S4a | Agent 循环 + CLI：`dream scene build`，模型出 spec、闸门失败回喂重试、每次尝试落 trace | **Done** |
| S4b | Studio 场景页：列表 / 预览 / 闸门详情 / 人工评审写回 trace | **Done** |
| S5 | 数据管道：`dream scene dataset` 统计 + SFT / 偏好对导出 | **Done** |
| S6 | 训练：在足量 trace 上做监督微调或独立的布局模型 | Backlog |

## 7.5 Agent 循环（S4a）

命令行：

```bash
# 模型写 spec，失败会把 issues 回喂重试（默认 3 次尝试）
dream scene build --prompt "一个靠河的渔村，需要酒馆、教堂和铁匠铺" \
  --kit packages/scene/kits/village-euro.json --out dist/scene/portside \
  --provider auto --trace dist/scene/agent-traces.jsonl

# 已经有 spec：跳过模型，直接构建与导出
dream scene build --spec my-spec.json --kit ... --out ... 
```

模型只被要求产出一件事：`SceneSpec`。几何仍然全部由求解器决定。

**失败回喂**：闸门不过时，下一轮提示词里会带上
`issues[].code + detail`、上一版 spec 和 metrics，要求模型只改必要字段。
实测一个典型 badcase——模型编了套件里不存在的 `grand-cathedral`

```
attempt 1: FAIL ["missing-required"]   ← 模型幻觉的 prefab id
attempt 2: PASS
trace lines 2, origin=agent
```

模型输出不稳的两处兜底：

1. 常见包在 ```json 里或前后带解释 → `extractJsonObject` 取第一个平衡的 `{}`
2. zod 校验失败的原始错误是几百行 JSON → 压成 `id: Required; name: Required` 一行

每次尝试（成功的和失败的都算）写一行 trace，`origin: "agent"`。一次 run 通常产出
2–3 条样本：一条失败样本带明确的失败类别，一条成功样本带完整指标。这正是
badcase 分析与偏好对（good vs bad）的原料。

## 7.6 Studio 场景页（S4b）

Studio 新增 `/scenes`：

```
┌ 场景列表 ───────────┬ 布局预览 ────────────┬ 检查器 ──────────┐
│ ● 河湾村      12    │                      │ 闸门 通过 / 0 项  │
│   好                │   SVG 俯视图          │ 指标表            │
│ ● Portside     9    │                      │ 人工评审 + 备注    │
└─────────────────────┴──────────────────────┴──────────────────┘
```

- 顶部输入一句话 → `POST /api/scenes {prompt}`：走 agent（失败回喂重试），
  闸门没过也照样落盘，因为失败的布局同样值得看、值得评
- `GET /api/scenes` 只回摘要（不含 svg），`GET /api/scenes/:id` 才带完整布局
- 评审三个按钮写 `POST /api/scenes/:id/review`：更新场景 JSON **并**在
  `scenes/traces.jsonl` 追加一条带 `review` 的 trace。

这样数据里就有了三类标签：闸门的客观指标、导航可达率（引擎侧）、人的主观判断
（good / acceptable / bad）。偏好对（同一 spec 的 good 与 bad 版本）由此成立。

存储位置：`<project>/.gamedream/studio/scenes/<id>.json` + `traces.jsonl`。

## 7.65 批量跑量（S5 之后）

```bash
# 有 key：真模型跑，产出可用于训练的 trace
OPENAI_API_KEY=... node scripts/scene-batch.mjs --prompts scripts/scene-prompts.txt

# 没 key：跑离线启发式基线（规则映射 prompt → spec），验证管线与产出
node scripts/scene-batch.mjs --provider fake
```

脚本逐步打印每条需求的尝试次数、建筑数、密度与耗时，结束时自动出统计并写
`stats.json`（含 provider 与 prompt 文件，便于溯源）。

注意两点：

1. **没有 key 时不要用 `--provider auto`**。脚本会直接退出并提示，因为让 provider
   抛错会把"环境没配好"伪装成"模型输出不合格"，污染失败样本。
2. `--provider fake` 产出的**是基线样本，不是模型样本**。它的价值是给出对照：
   一个懂 kit 的规则小函数能拿到 24/24 通过率，说明闸门本身不算苛刻，模型跑不好
   时问题更可能在提示词或 spec 约束上。

## 7.7 数据管道（S5）

```bash
dream scene dataset --traces dist/scene-dataset/traces.jsonl \
  --sft dist/scene-dataset/sft.jsonl --dpo dist/scene-dataset/dpo.jsonl
```

输出一份统计 + 两个训练集：

```
Samples: 6 (passed 3, failed 3, skipped 0)
Origin: agent=6
With prompt: 6  avgBuildings=10 avgDensity=0.077
Determinism: 6/6 groups reproducible
Reviews: good=0 acceptable=0 bad=0 none=6
Top failures:
  missing-required: 3
SFT: 3 samples -> sft.jsonl
Preference pairs: 3 -> dpo.jsonl
```

三条规则值得记住：

1. **SFT 只收过闸门的样本。** 把 `missing-required` 的失败样本也塞进去，等于教模型
   编造不存在的 prefab id。失败样本的去处是偏好对的 `rejected`。
2. **确定性按完整 spec 指纹分组**，不是 `id + seed`。同 id、同 seed 但 `required`
   不同是两个不同输入，之前这条会误报"不可复现"。
3. **坏行跳过并计数**，不让一条脏数据打断整份数据集。

导出格式：

- SFT：`{messages: [system, user(prompt + kit), assistant(spec JSON)]}`
- 偏好对：`{prompt, chosen, rejected, reason, meta}`；两路来源——闸门（pass vs fail）
  与人工评审（good vs bad）

## 7.8 美术素材（artwork）

布局本身只有矩形和颜色，进引擎是色块。素材层把"哪个 prefab 长什么样"接进来：

```
<project>/.gamedream/studio/art/<kitId>/<prefabId>.png
```

约定这个目录后，三处自动生效：

1. **Studio 预览**：`renderSceneSvg` 把 png 以 data-uri 内嵌，布局图里看到的就是贴图
2. **Godot 导出**：有贴图的建筑生成 `Sprite2D`（按 footprint 缩放），没有的仍退回 `Polygon2D`
3. **素材生成**：`POST /api/scenes/art` 或 `node scripts/scene-art.mjs` 按 kit 的
   palette / roof / footprint 生成一套顶视占位图（屋檐、屋脊、门窗），并写 manifest

换真实美术不需要改代码：把同名 png 覆盖进那个目录即可。

素材尺寸约定：宽度 = `footprint.maxWidth × tileSize`，高度同理。导出时按实际
footprint 等比拉伸，所以同一张图能用于该 prefab 的所有尺寸变体。

占位素材是程序画的，风格统一但细节有限；它的作用是让"布局 + 素材 + 导出"这条链路
先跑通，真实美术到位后直接替换文件。

## 8. Godot 导出（S2）

`exportGodotScene(layout, dir)` 产出一个可直接用 Godot 4.4 打开的项目：

```
project.godot            # main_scene 指向 scene/scene.tscn，gl_compatibility
scene/ground.png         # 地块 + 道路的底图（建筑不烘焙进去）
scene/scene.tscn         # Sprite2D 地面 + 建筑 StaticBody2D + 四面边界墙 + Marker2D 锚点
scene/scene_check.gd     # 加载后打印节点统计并退出，供 CI 核对
scene/layout.json        # 原始布局，便于与节点对照
```

节点映射：每栋建筑 → `StaticBody2D`（`Polygon2D` 屋顶 + `CollisionShape2D` 碰撞 +
`Marker2D` 入口），每个锚点 → `Marker2D`。相同尺寸的建筑共用 `RectangleShape2D`。

### 导航网格

`NavigationRegion2D` 的 `NavigationPolygon` 由可行走栅格直接生成：每个可走格一个
四边形，**顶点按整数坐标全局去重**。去重是唯一的关键——相邻多边形必须共享完全
相同的两个顶点索引，导航服务器才会把它们连起来；各算各的顶点会让整张网格变成
互不相连的孤岛。

导出时把建筑与水面标记为不可走，其余（道路、巷道、广场、绿地、空地）都可走。

验证方式不靠"看起来对"，而是让引擎自己报数：出生点到每个建筑入口求一条路径，
末点必须落在入口 2 像素内。

```
$ GODOT_BIN=... node scripts/scene-godot-smoke.mjs
SCENE_GODOT_OK=riverbend  buildings=12 entrances=12 nav=12/12 anchors=3 spawn=1488,2448
SCENE_GODOT_OK=stonecross buildings=23 entrances=23 nav=23/23 anchors=3 spawn=1456,2960
SCENE_GODOT_OK=lakeside   buildings=5  entrances=5  nav=5/5   anchors=3 spawn=688,1424
GODOT_SCENE_OK=1
```

第三个坑：导航地图是**异步构建**的。6894 个多边形的网格在小场景里 3 帧就好，
大地图要十几帧；只等固定两三帧会得到 `map_get_closest_point() == (0,0)`、路径全空，
看起来像是网格没生成。导出脚本改成轮询等待出生点落在网格上（上限 40 帧）再测。

两个必须踩过的坑：

1. `[ext_resource ...]` 用 `]` 结尾，不是 `/>` —— 写成自闭合会让 Godot 报
   "Parse Error: Unexpected end of file"，且错误行号指向第一条 ext_resource，
   极具误导性
2. `load_steps` 必须等于 ext + sub + 1；边界墙的碰撞体也是 sub_resource，
   若在写 header 之后才登记，数量会偏少，同样表现为 EOF 错误

S1 已完成，可跑 `node scripts/scene-demo.mjs` 生成三个示例
（河湾村 / 石十字镇 / 湖畔小村），输出 `dist/scene-demo/*.svg|json` 与
`scenes.jsonl`。

## 7. 当前限制

- 只做平面（俯视）布局；高度、天际线、遮挡关系尚未建模
- 建筑是矩形占位 + 朝向，没有真正的 prefab 尺寸/贴图信息
- 装饰只有 7 种道具，密度控制是均匀的，没有"街区性格"（商业街 vs 住区）
- 次级路网是规则间隔的，没有环路、断头路或街角退让；地形（坡度/水系）不参与选线
- 河道只支持横穿，不支持任意曲线；桥梁只在主干道处
- 闸门是规则式的，没有学习得到的"好看"评分
- 地面是烘焙好的底图，不是 `TileMapLayer`，因此不能在编辑器里逐格刷改

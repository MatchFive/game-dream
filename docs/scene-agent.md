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
   每 18 格补一条宽 2 的次级街道，形成街区网格。所有道路都记成"带"（band）
2. 水系：河流横穿，**每条纵向道路都架桥**（只给主干道架桥会让次级街道被河切成孤岛）；
   水面按桥切成多段登记 —— 整条河当成一块水，导航会把桥一起封死
3. 交叉口广场 + 水井
4. 街区 = **路网带之间的空隙**，再 BSP 递归切成地块（最小 8 格）。
   先切街区再切地块，是为了让每块地天生临街——这是"街墙"能成立的前提；
   旧实现按"十字路划四块"再切，次级街道会横穿地块内部，地块只能整块丢弃
5. 摆放（按优先级）：广场正面 → 必需要素贴街 → 院落 → 沿街连排 → 独立落地 → 绿地
   - **街墙**：沿前脸线一栋接一栋，共用山墙、同排进深一致；收尾那栋吃掉剩余宽度，
     否则每块地尾巴都空 2–3 格，一排看起来是"断开的独栋"
   - **后巷**：地块够深时在街墙背后切一条 2 格巷子，向两侧延伸到相邻地块直到接上路，
     再沿巷排第二排。巷子横贯地块并借用两侧 1 格的退让带接主干道，
     所以不会出现"死胡同，门口走不出去"
   - **院落**：主屋退 3 格留出后院，侧边留 2 格通道让后排的门走得出去
6. 每条建筑入口向道路挖一条 1 格宽 L 形巷道 —— 让建筑真的"接上路网"，
   而不是浮在空地上
7. 沿主干道布灯、绿地种树、院落放树与箱子、广场摆放、水边放码头
8. 出生点（南端主干道）与出口（东端）

### 形态指标

`metrics` 里除了密度，还有三个用来衡量"像不像聚落"的指标：

| 指标 | 含义 | 参考值 |
| --- | --- | --- |
| `streetWall` | 贴街连排的建筑数 | 应占多数 |
| `courtyards` | 带院落的建筑数 | 地块够深时出现 |
| `standalone` | 独立落地的建筑数 | 越少越好（高说明在撒房子） |
| `attachedShare` | 共享山墙（≥2 格）的建筑占比 | 村庄 0.3 / 城镇 0.5 |

同一套 spec 改版前后：河湾村 12 → 32 栋、密度 0.067 → 0.126；石十字镇 23 → 65 栋、
密度 0.073 → 0.207。真实引擎里 `nav` 仍然是全员可达（32/32、65/65）。

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
| S16/S17 | 场景属于项目：`game/scenes/<id>/` + `index.json`；CLI `--project` 与 Studio 同一出口 | **Done** |
| T1 | 真 tileset：外部素材库切瓦片（`scene tiles import`）+ 内置 `village-cn` | **Done**（1 个主题） |
| S4b | Studio 场景页：列表 / 预览 / 闸门详情 / 人工评审写回 trace | **Done** |
| S5 | 数据管道：`dream scene dataset` 统计 + SFT / 偏好对导出 | **Done** |
| S6 | 训练：在足量 trace 上做监督微调或独立的布局模型 | Backlog |

## 7.5 Agent 循环（S4a）

命令行：

```bash
# 建进项目（项目 agent 用这条）：落到 <project>/game/scenes/<id>/，
# 游戏侧 preload "res://game/scenes/<id>/scene.tscn"
dream scene build --prompt "一个靠河的渔村，需要酒馆、教堂和铁匠铺" \
  --kit packages/scene/kits/village-euro.json --project ./my-game \
  --provider auto --trace .gamedream/studio/traces.jsonl

# 反复迭代同一个场景：复用目录，顺手清掉上一版多余的 prefab
dream scene build --prompt "..." --project ./my-game --id portside --replace

# 只想单独打开看看：独立工程出口（不属于任何项目）
dream scene build --prompt "..." --out dist/scene/portside

# 已经有 spec：跳过模型，直接构建
dream scene build --spec my-spec.json --project ./my-game
```

**素材**：地表与道具可以直接用外部素材库，不用程序画色块。

```bash
# 选取表 → 切瓦片 → 落进项目美术目录（导出器随后自动用）
dream scene tiles import \
  --source "F:/美术资产/整理输出" \
  --picks packages/scene/kits/village-cn.tiles.json \
  --out ./my-game/.gamedream/studio/art

# 中式套件：几何与欧式一致，换画风配色；没有素材时会退回色块
dream scene build --prompt "长安街市，酒馆、集市、庙宇" --kit village-cn --project ./my-game
```

选取表只写"哪张图的哪一格当哪种地形"（`cell: [行, 列]` + `at: [x, y]` 锚点）。
A2 图块的单元上半是 autotile 四角、**下半才是本体纹理**，所以 `at` 一般给 `[24, 72]`。

**素材理解**：素材库是"一堆图集"，不是"一堆建筑"。所以要先把语义从图里读出来。

```bash
# 切片 + 让视觉模型认每一块（编好号的拼版 → 模型只回编号）
dream scene assets index --source <素材库> --only <图集.png> --out art-index.json --kit village-cn

# 按语义查："要一个酒馆" / "要能平铺的青砖地"
dream scene assets find --index art-index.json --text 酒
dream scene assets find --index art-index.json --kind terrain --tileable

# 直接落成 kit 的立绘（模型没归类的 prefab 会留空，不会拿"最像的"凑）
dream scene assets apply --index art-index.json --source <素材库> --out .gamedream/studio/art --kit village-cn
```

**为什么默认是 `--project` 而不是 `--out`**：场景是游戏的资产，不是旁边的一个演示工程。
`--project` 与 Studio 的导出按钮调同一组函数（`studio/src/scenes.ts`），两条产品路径不会漂移；
`--out` 留着只是方便单独打开检查。

**目录名**：取 `spec.id`；被占用时加序号（`plaza` → `plaza-2`），`--id` 显式指定，
`--replace` 复用（并清理上一版生成的 `prefabs/`、`art/`、`tiles.*`）。不给 `--replace`
就另开一个目录——脚本化迭代时**记得带上**，否则 `game/scenes/` 会攒一堆同名目录。

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
# 真模型：直接复用 Studio 里配好的凭据，不用再导出 env
dream scene batch \
  --prompts packages/scene/prompts/settlements.txt \
  --out dist/scene-batch \
  --workspace dist/nav-verify     # 读 <workspace>/.gamedream/studio/settings.json

# 没 key / 只想验管线：规则基线（prompt → spec 的启发式映射）
dream scene batch --prompts ... --out ... --provider fake --limit 3
```

逐条打印 `pass/fail · 建筑数 · 密度 · 耗时`，结束时出统计并写 `stats.json`
（含 provider 与 prompt 文件，便于溯源）。单条需求崩了不会中断整批，
异常计入 `skipped`——一条脏需求不该让后面几十条跑不了。

`--limit` 用来先估成本；`--append` 才累积到已有 trace，默认每次清空。

首批 24 条真实样本（MiniMax-M3.1-Flash）的结论见
[`evidence/scene-batch/README.md`](evidence/scene-batch/README.md)：
**24/24 一次过闸门，但这恰恰是问题**——闸门只保证几何合理，不保证"做的是你要的东西"。
"城墙内""沿海崖顶""梯田沿等高线"这类需求都被静默降级成最近的地形，
而没有任何指标能看出来。

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
2. **Godot 导出**：每种建筑生成一个 prefab（`Sprite2D` 贴图，缺图时退回 `Polygon2D`），
   场景里只放实例
3. **素材生成**：`POST /api/scenes/art` 或 `node scripts/scene-art.mjs` 按 kit 的
   palette / roof / footprint 生成一套顶视占位图（屋檐、屋脊、门窗），并写 manifest

换真实美术不需要改代码：把同名 png 覆盖进那个目录即可。

素材尺寸约定：宽度 = `footprint.maxWidth × tileSize`，高度同理。导出时按实际
footprint 等比拉伸，所以同一张图能用于该 prefab 的所有尺寸变体。

占位素材是程序画的，风格统一但细节有限；它的作用是让"布局 + 素材 + 导出"这条链路
先跑通，真实美术到位后直接替换文件。

### AI 生成（ComfyUI）

```bash
dream scene art \
  --kit packages/scene/kits/village-euro.json \
  --art <project>/.gamedream/studio/art \
  --workflow <api-format-workflow.json> \
  --comfy http://127.0.0.1:8000 \
  [--only house-small,chapel] [--seed 7] [--no-transparent]
```

这是项目能力（`packages/scene/src/art-gen.ts`），不是一次性脚本：CLI、项目 agent、
Studio 调的是同一份实现。按 [`boundaries.md`](boundaries.md)，美术属于游戏实现，
只能由项目侧产出——编码 agent 不能手工跑脚本再把图当交付。

流程：读 kit → 逐 prefab 拼提示词 → 提交 ComfyUI → 等出图 → **注入透明分支** →
按 alpha 裁边 → 落盘 + `art-manifest.json`（提示词、尺寸、字节数全记下来）。

三处细节都踩过：

1. **透明不是模型给的，是后处理给的。** 工作流本身出的是白底图；`applyTransparency`
   按图结构接到 Save 节点的输入源上，加 `RemoveBackground → InvertMask →
   JoinImageWithAlpha` 这条支路，不依赖固定节点 id。需要 ComfyUI 装了 `birefnet`。
2. **提示词要写"高位 3/4 视角"**（`high three-quarter angle`、`roof dominant`、
   `front wall visible`）。写死"top-down"会得到一块像贴纸的屋顶，写"tileset"
   会得到一整座城镇平面。
3. **必须裁掉透明边距**。模型把主体画在中央、四周留大量空白，不裁的话建筑比格子小一圈。

### 风格锚与两种贴图模式

逐张生成最容易出的问题是"像三套素材"。解决办法是**所有 prompt 共用一段风格锚**
（笔触、色板、光照、细节量一致），只让"建筑类型 + 屋顶材质"变化。改完之后七张
（民居/长屋/铁匠铺/酒馆/教堂/市场/码头仓）能看出是同一套东西。

但把风格锚写成"top-down tileset"会把模型推向两个失败方向：要么退回 3/4 立面
房子（溢出足迹），要么干脆画成一整座城镇平面。所以现在**明确要高位 3/4 视角**，
并在导出侧配一个模式：

| artStyle | 贴图处理 | 适用 |
| --- | --- | --- |
| `tile` | 铺满 footprint | 严格正俯视的屋顶图 |
| `billboard` | 等宽缩放、底边贴 footprint 底边、向上溢出 | 带立面的 3/4 视角（RPG 常见） |

billboard 模式下建筑按"底边 y"排序绘制，靠下的盖住靠上的，避免溢出部分穿模。

### 预览不要内嵌 base64

一套 1024² 贴图内嵌进 SVG 会让它涨到 7.6 MB，Studio 场景页直接卡死。现在 SVG 只写
`<image href="/api/scenes/art/<kit>/<prefab>.png">`，同样的布局是 14 KB，浏览器还能缓存。

## 8. Godot 导出（S2）

`exportGodotScene(layout, dir, { artDir, artStyle })` 产出一个可直接用 Godot 4.4
打开、并且能继续编辑的项目：

```
project.godot            # main_scene 指向 scene/scene.tscn，gl_compatibility
scene/scene.tscn         # TileMapLayer × 2 + prefab 实例 + 导航 + 边界墙 + 锚点
scene/tiles.png          # 9 格瓦片 atlas（土地×3 / 草×2 / 路 / 石板 / 水×2）
scene/tiles.tres         # TileSet：一个 atlas source，每种地形一个瓦片
scene/art/<prefab>.png   # 建筑贴图
scene/scene_check.gd     # 加载后打印节点/瓦片/导航统计并退出，供 CI 核对
scene/layout.json        # 原始布局，便于与节点对照
prefabs/<prefab>.tscn    # 每种建筑一个预制体
```

这套结构是**库能力**，不是一次性脚本：`dream scene build`、Studio 的
「导出 Godot 工程」按钮、以后 agent 的工具调用都走同一个 `exportGodotScene`。

### 地面是瓦片，不是底图

以前地面是一张烘焙好的 PNG（`Sprite2D`），看着对但改不了。现在是两张
`TileMapLayer`：

| 图层 | 内容 |
| --- | --- |
| `Ground` | 地形：土地 / 草地 / 广场 / 水面，**铺满整张图** |
| `Roads` | 道路与巷道，叠在地形之上（桥因此天然出现在水面上） |

布局里不保存栅格（那会让 trace 膨胀二十倍），导出时按「地块 → 道路折线」重画一遍。
瓦片数据写成 `tile_map_data`：**2 字节版本号 + 每格 12 字节**
（x, y, source_id, atlas_x, atlas_y, alternative，全部 uint16 小端）。这个格式是拿
真实引擎写一遍再读回来核对的，不是猜的。

瓦片不是纯色：每种地形带确定性噪声（草有草丛暗点、石板有缝、水有波纹），
同一格每次导出都得到同一个变体，换 atlas 就换画风。

### 建筑是 prefab 实例

每栋建筑不再是场景里平铺的一堆节点，而是 `prefabs/<prefab>.tscn` 的一个实例：

```
[gd_scene]
[node name="tavern" type="StaticBody2D"]      ← prefab 根就是碰撞体
  Art  (Sprite2D, 贴图)                        ← 换图只改这里
  Body (CollisionShape2D, 默认 1 格)
```

场景里每栋建筑只写三样随 footprint 变化的东西（Godot 的实例属性覆盖语法）：

```
[node name="building-3" parent="Buildings" instance=ExtResource("prefab_tavern")]
position = Vector2(320, 480)

[node name="Art" parent="Buildings/building-3" index="0"]     ← 贴图缩放/锚点
[node name="Body" parent="Buildings/building-3" index="1"]    ← 碰撞尺寸
[node name="Entrance" type="Marker2D" parent="Buildings/building-3"]  ← 正门
```

好处很直接：**美术改一次 prefab，全图十几栋一起变**；给 prefab 加一盏灯、一块招牌，
所有实例都有。而尺寸、正门位置这些"每栋都不一样"的数据仍然是每栋覆盖的。

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
SCENE_GODOT_OK=riverbend  buildings=32 entrances=32 nav=32/32 anchors=3 tiles=7680/819
SCENE_GODOT_OK=stonecross buildings=65 entrances=65 nav=65/65 anchors=3 tiles=11520/3049
SCENE_GODOT_OK=lakeside   buildings=15 entrances=15 nav=15/15 anchors=3 tiles=2688/467
GODOT_SCENE_OK=1
```

`tiles=<地形格>/<道路格>` 是引擎报的 `get_used_cells().size()`：地形层必须等于
地图格数（漏一格就会露出引擎底色），道路层必须有内容。

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

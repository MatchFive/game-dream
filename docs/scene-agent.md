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

1. 十字主干道（宽 4，位置随种子偏移，不机械居中）
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
| S2 | Godot 导出：`.tscn` + `TileMapLayer` + `NavigationRegion2D` + 碰撞，`smoke:godot` 里走一遍 | Next |
| S3 | Unity 导出：`.unity` 场景 + prefab 实例 + NavMesh 烘焙参数 | Next |
| S4 | Agent 工具：`scene.plan` / `scene.build` / `scene.revise` / `scene.validate`，接进 develop 工具集与 Studio 画布 | Next |
| S5 | 数据管道：trace 聚合、badcase 看板、SFT/偏好数据集导出 | Backlog |
| S6 | 训练：在足量 trace 上做监督微调或独立的布局模型 | Backlog |

S1 已完成，可跑 `node scripts/scene-demo.mjs` 生成三个示例
（河湾村 / 石十字镇 / 湖畔小村），输出 `dist/scene-demo/*.svg|json` 与
`scenes.jsonl`。

## 7. 当前限制

- 只做平面（俯视）布局；高度、天际线、遮挡关系尚未建模
- 建筑是矩形占位 + 朝向，没有真正的 prefab 尺寸/贴图信息
- 装饰只有 7 种道具，密度控制是均匀的，没有"街区性格"（商业街 vs 住区）
- 河道只支持横穿，不支持任意曲线；桥梁只在主干道处
- 闸门是规则式的，没有学习得到的"好看"评分

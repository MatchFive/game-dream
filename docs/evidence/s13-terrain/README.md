# S13 · 地形与边界表达力（海岸 / 城墙 / 高程）

> 2026-11-28 · 对应 `roadmap.md` S13、`progress.md` P0

## 为什么做这件事

重跑 24 条真实需求（`docs/evidence/scene-batch/traces-v2.jsonl`）时，25 条样本里 19 条
自己声明了 `unmet`。把它们按词条归类，排在前面的全是同一类东西：

```
perimeter walls · walled city · border fortress · checkpoint gate
coast · cliffs · house orientation toward the sea
mountain elevation bands · terraced hillside · contour-aligned · mountain pass
```

这不是模型偷懒，是求解器真的没有这些概念——`spec.water` 只有 `none|pond|river`，
没有墙、没有台阶。所以 S13 不是"加三个字段"，是把这三种地形变成 spec 的一等公民。

## 做了什么

| 能力 | spec | 求解器 | 导出 |
| --- | --- | --- | --- |
| 海岸 | `water: "coast"` | 海沿一条边铺开，岸线逐格起伏（±2 格），水面按行/列合并成矩形 | 水面进导航禁行区；岸边一格铺沙（`sand` 瓦片） |
| 城墙 | `walls: { enabled, thickness, setback }` | 贴着建成区外圈砌墙，**路穿过的地方自动留门洞**；经过水的地方断开 | `TownWalls` 静态碰撞体 + `Gates` Marker2D；墙进导航禁行区 |
| 高程 | `elevation: { levels, step, from }` | 从高地那侧每 `step` 格切一条崖线（错开 ±1 格走等高线），路穿崖处变坡道 | `Cliffs` 静态碰撞体；建筑记 `elevation`，导出按级给 `z_index` |

三者的共同约束：**连通性由 BFS 判定，不由求解器"认为"**。墙是 `wall`、崖是 `cliff`，
门洞与坡道是 `road`；`Grid.walkable()` 只认栅格。

配套改动：

- 瓦片新增 `sand` / `rock` / `wall` 三种地形（atlas 从 9 格涨到 14 格）
- kit palette 新增可选 `sand` / `rock` / `wall`，不给就按既有色推导（老 kit 不改也能导）
- 开城墙时城区内缩 9 格，墙外留田野并在预览里撒树——否则墙永远贴着地图边，看起来像画框
  （当时的引擎导出还不含道具，树/灯/井只出现在 SVG 预览；S15 已补上，见 `../s15-props/`）
- 新闸门 `sealed-walls`：墙围了一圈却一个门都没有
- 新指标 `walls / gates / cliffs / ramps / terraces / coast / elevationMax`

## 两个顺手修掉的求解器 bug

跑真模型批次时暴露出来的，不是 S13 新引入的：

1. **院落尝试失败会吃掉必需建筑**。`placeCourtyard` 先从需求队列取建筑，放不下时直接
   `return false`，取出来的东西没还回去。"72×60 切三级台阶 + 四条必需建筑"因此报
   `missing-required`（smithy / tavern 消失）。修法：失败路径把预置项 `unshift` 回队列。
2. **正门可能落在崖上**。台阶地形里房子常紧贴崖壁，`entranceFor` 只看朝向不看脚下。
   现在按 `正面 → 对门 → 两侧` 找一格能站的门位，四边都不行就不放这栋房子
   （宁可不放，也不放一栋没有门的房子）。

## 验收

### 真引擎（Godot 4.4.1，`scripts/scene-godot-smoke.mjs`）

六个场景全部通过，含三个新增的 S13 场景：

```
SCENE_GODOT_OK=riverbend       buildings=32 nav=32/32  walls=0  cliffs=0
SCENE_GODOT_OK=stonecross      buildings=65 nav=65/65  walls=0  cliffs=0
SCENE_GODOT_OK=lakeside        buildings=15 nav=15/15  walls=0  cliffs=0
SCENE_GODOT_OK=cliffharbor     buildings=33 nav=33/33  walls=0  cliffs=0   ← 海岸
SCENE_GODOT_OK=walledquarter   buildings=60 nav=60/60  walls=22 cliffs=0   ← 城墙
SCENE_GODOT_OK=terracevillage  buildings=72 nav=72/72  walls=0  cliffs=28  ← 三级台阶
GODOT_SCENE_OK=1
```

墙与崖的碰撞体数量与 layout 一一对上（`GAMEDREAM_SCENE_WALLS` / `_CLIFFS`），
说明"布局里挡路的东西"和"引擎里挡路的东西"是同一份数据。

截图（Godot 真实窗口渲染，非示意图）：

| 文件 | 场景 | 看什么 |
| --- | --- | --- |
| `coast.png` | 崖顶海港 | 右侧海面、起伏岸线、岸线一格浅沙、路通到岸边 |
| `walls.png` | 城墙内的旧城 | 墙成环、18 处路口开门、墙外一圈田野 |
| `terraces.png` | 半山梯田村 | 两条错开的崖线、竖向路在崖上变坡道、房子分三级 |

### 真模型（MiniMax-M3.1-Flash，`dream scene batch`）

把 v2 批次里因这三种能力而声明 unmet 的五条原句原样重跑（`traces-rerun.jsonl`）：

| 需求 | 旧 unmet（3 条） | 本轮 unmet | 用上了什么 | 结果 |
| --- | --- | --- | --- | --- |
| 边境要塞附属的居民区，房屋沿墙内侧排布 | border fortress / perimeter walls / houses along inner wall | `fortress building (no fortress prefab)` | `walls t1 s2` · 8 段墙 · 4 门 | PASS |
| 半山腰的梯田村，房屋沿等高线错落分布 | elevation bands / contour-aligned / terraced | `[]` | `elevation 3×12 north` · 35 段崖 · 4 坡道 | PASS |
| 沿海崖顶的小镇，房屋面向海面 | coast / cliffs / house orientation | `[]` | `water coast` + `elevation 2×12 east` · 22 段崖 | PASS |
| 城墙内的小型城池，街巷狭窄 | walled city / narrow street | `narrow street width` | `walls t1 s2` · 9 段墙 · 5 门 | PASS |
| 山间隘口的关卡聚落，一条主路贯穿 | mountain-pass elevation / checkpoint gate | `[]` | `walls t1 s3` + `elevation 2×12` | PASS |

- **五条里三条 unmet 归零**，另两条只剩真正没做的能力：`fortress` 是建筑（kit 里没有城堡 prefab），
  `narrow street width` 是路宽参数（`mainW` 目前写死 4）。
- 5/5 过闸门，确定性 5/5。
- 城墙/海岸/高程/崖/坡道/关卡这些词条**没有再出现在任何 unmet 里**。

## 已知没做

- **房屋朝向海面**：门朝向仍由路网决定，不由海岸决定。真实海滨城镇的门本来也开在街上，
  所以没为此改求解器；如果要"立面朝海"，应该是 prefab 级的立面参数（跟 S9 一起做）。
- **崖壁的视觉厚度**：现在崖只有 1 格（32px），远看是一条深色线。真正的"台阶感"要靠
  美术（T1 的真 tileset）给崖面画高度，程序瓦片只能做到明暗。
- **地貌种类**：雪原 / 沙漠 / 沼泽 / 矿坑仍然没有——这三类要动的是 ground 材质与 prefab 集，
  不是地形骨架，留给 T1/T2。

## 复跑

```bash
pnpm -w typecheck && pnpm -w test              # 435 passed / 15 skipped
GODOT_BIN=<godot> node scripts/scene-godot-smoke.mjs
node packages/cli/dist/index.js scene batch \
  --prompts dist/s13-batch/prompts.txt --out dist/s13-batch-v2 --workspace <ws>
```

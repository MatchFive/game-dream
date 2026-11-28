# S11 · 场景交互点

> 2026-11-28 · 对应 `progress.md` P1 · 依赖 S9

## 问题

场景以前只能看：房子是房子，广场是广场，没有任何"能碰的东西"。
对 RPG 来说这是死的——商店进不去、码头不能出海、教堂不能祈祷，
场景就只是一张好看的图。

## 做了什么

交互语义写在 **kit**，位置由**求解器**决定，产物是 **layout 里的数据**：

```json
// kit.prefabs[] 里声明"这栋房子能做什么"
{ "id": "tavern", "interactions": [{ "kind": "rest", "radius": 1 }, { "kind": "shop", "radius": 1.5 }] }

// 求解后的 layout
{ "id": "interaction-2", "kind": "rest", "building": "building-2", "at": [64, 23], "radius": 1, "label": "tavern:rest" }
```

三个要点：

1. **交互点就落在正门那一格**。玩家走到门口即可触发，不需要再发明一套坐标约定；
   也因此,"门不可达"和"交互点不可达"是同一个问题，闸门顺手就能守。
2. **语义在 kit、位置在求解器**。求解器不知道"酒馆能休息"，它只知道"这个 prefab
   声明了 rest"。换一套 kit（酒馆→当铺）不需要改代码。
3. **一栋楼可以有多个交互**：酒馆同时是 `rest` 和 `shop`，两个 Area2D 在门口同心，
   游戏按 kind 分派（`radius` 不同时会有内外圈之分）。

内置套件的语义：

| prefab | 交互 | 半径 |
| --- | --- | --- |
| tavern | `rest` + `shop` | 1 / 1.5 |
| market-hall | `trade` | 2 |
| chapel | `worship` | 1 |
| smithy | `craft` | 1 |
| dock-house | `fish` | 1 |

## 导出

每个交互点一个 `Area2D`，形状复用 `RectangleShape2D` 池（同半径共用）：

```
[node name="interaction-0" type="Area2D" parent="Interactions"]
position = Vector2(1680, 1168)
monitoring = true
metadata/kind = "trade"
metadata/building = "building-0"

[node name="Shape" type="CollisionShape2D" parent="Interactions/interaction-0"]
shape = SubResource("shape_21")
```

**游戏侧认 `metadata/kind`，不认节点名**——名字只是给人看的。

## 验收

- 新闸门 `interaction-blocked`：交互点落在不可走/不可达的格子上就报错
  （这类错在游戏里表现为"门就在眼前但点不动"）
- 新指标 `interactions` / `interactionKinds`：Studio 场景页与 badcase 看板直接可见
- 引擎自检把 Area2D 数出来并与 layout 对账，`kind` 集合也一起比：

```
SCENE_GODOT_OK=riverbend      interactions=4[worship,rest,shop,craft]
SCENE_GODOT_OK=stonecross     interactions=4[trade,worship,rest,shop]
SCENE_GODOT_OK=lakeside       interactions=1[craft]
SCENE_GODOT_OK=cliffharbor    interactions=4[worship,rest,shop,fish]
SCENE_GODOT_OK=walledquarter  interactions=4[worship,trade,rest,shop]
SCENE_GODOT_OK=terracevillage interactions=5[worship,craft,trade,fish]
GODOT_SCENE_OK=1
```

（引擎里遍历顺序与 layout 不同，所以比的是集合——这条也写进了冒烟脚本。）

预览也看得见：`preview.png` 是石十字镇的 SVG 渲染，门口那些彩色圆环就是交互点
（紫=rest、蓝=shop、绿=trade、黄=worship、橙=craft），`stonecross.svg` 可直接打开。

## 没做

- **没有触发逻辑**：Area2D 只提供"进入区域"的信号，具体弹出什么 UI 是游戏侧的事。
  导出里也没写脚本——写脚本等于替用户决定玩法。
- 没有交互点之间的互斥/条件（比如"先跟铁匠说话才能进矿洞"）。
- 没有把交互点接到 `dream request` 的验收里（那是 M2 的事）。

## 复跑

```bash
pnpm -w typecheck && pnpm -w test          # 454 passed / 15 skipped
GODOT_BIN=<godot> node scripts/scene-godot-smoke.mjs
```
